"""Per-run, outside-worker Responses broker. No credentials are stored here.

The independent review must establish the Docker credential-injection proxy,
account/model access and conservative tariff ceilings. This implements request
reservation, not authority or a guarantee about an unknown provider tariff.
"""
import hashlib
import http.server
import json
import os
import socketserver
import time
import urllib.request


PROFILES = {
    'gpt-5.6-sol': {'endpoint': 'https://api.openai.com/v1/responses',
                    'sentinel': 'sk-sandbox', 'minimumOutputTokens': 1, 'serviceTier': 'default'},
    'muse-spark-1.3': {'endpoint': 'https://api.meta.ai/v1/responses',
                       'sentinel': 'forecode-meta-sandbox', 'minimumOutputTokens': 16, 'serviceTier': 'auto'},
    'muse-spark-1.3-contributor': {'endpoint': 'https://api.meta.ai/v1/responses',
                       'sentinel': 'forecode-meta-sandbox', 'minimumOutputTokens': 16, 'serviceTier': 'auto'},
}


def reviewed_profile(request):
    model = request.get('model')
    if (model not in PROFILES
            or request.get('provider', {}).get('endpoint') != PROFILES[model]['endpoint']):
        raise ValueError('model and fixed provider endpoint mismatch')
    return PROFILES[model]


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def atomic(file, value):
    temp = str(file) + '.next'
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as out:
            out.write(canonical(value))
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, file)
        parent = os.open(os.path.dirname(str(file)), os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


class ReservationCapacityError(ValueError):
    """Safe numeric projection; no provider or caller text belongs here."""
    def __init__(self, input_upper, token_output, money_output, minimum):
        super().__init__('hard reservation exhausted')
        self.projection = {'inputTokenUpperBound': input_upper,
                           'tokenOutputCapacity': token_output,
                           'moneyOutputCapacity': money_output,
                           'minimumOutputTokens': minimum}


class Reservations:
    """Serial server: reserve worst-case tokens/microUSD durably, never refund."""
    def __init__(self, directory, request):
        self.file = directory / 'budget.json'
        self.request = request
        self.profile = reviewed_profile(request)
        self.value = {'requests': [], 'reservedTokens': 0, 'reservedMicroUsd': 0,
                      'opaqueInputs': {}, 'blockedReason': None}
        if self.file.exists():
            # A broker is never resumed: its previous paid request might still
            # be executing. Recovery can only clean up the original attempt.
            raise ValueError('broker reuse forbidden')
        atomic(self.file, self.value)

    def reserve(self, raw):
        r = self.request
        if self.value['blockedReason'] is not None:
            raise ValueError('provider outcome requires owner review')
        if time.time() >= r['deadline'] or len(raw) > 1_048_576:
            raise ValueError('budget deadline or request limit')
        body = json.loads(raw)
        if not isinstance(body, dict) or body.get('model') != r['model']:
            raise ValueError('unapproved model')
        # Stateless, text-only requests. Hidden server-side history, remote
        # files/media and separately billed hosted tools defeat byte accounting.
        if set(body) - {'model', 'input', 'instructions', 'tools', 'tool_choice',
                        'parallel_tool_calls', 'reasoning', 'text', 'stream',
                        'store', 'include', 'max_output_tokens', 'service_tier',
                        'prompt_cache_key', 'client_metadata', 'stream_options'}:
            raise ValueError('unsupported provider field')
        if not isinstance(body.get('input'), (list, str)):
            raise ValueError('explicit input required')
        # Codex's delivery/cache metadata is not source context or authority.
        # Do not pass opaque client metadata or cache hints to the provider.
        for key in ['prompt_cache_key', 'client_metadata', 'stream_options']:
            body.pop(key, None)
        include = body.get('include', [])
        if not isinstance(include, list) or any(v != 'reasoning.encrypted_content' for v in include):
            raise ValueError('unsupported response expansion')
        body['include'] = include
        nodes = [body]
        count = 0
        opaque_upper = 0
        while nodes:
            item = nodes.pop()
            count += 1
            if count > 4096:
                raise ValueError('input depth/size')
            if isinstance(item, dict):
                if 'encrypted_content' in item:
                    content = item['encrypted_content']
                    if item.get('type') != 'reasoning' or not isinstance(content, str):
                        raise ValueError('unapproved opaque context')
                    bound = self.value['opaqueInputs'].get(hashlib.sha256(content.encode()).hexdigest())
                    if bound is None:
                        raise ValueError('opaque context not from this reserved attempt')
                    opaque_upper += bound
                if any(k in item for k in ['image_url', 'file_id', 'file_url', 'file_data', 'audio', 'video']):
                    raise ValueError('text-only broker')
                if item.get('type') in ['input_image', 'input_file', 'input_audio', 'item_reference']:
                    raise ValueError('text-only broker')
                nodes.extend(item.values())
            elif isinstance(item, list):
                nodes.extend(item)
        if any(t.get('type') not in ['function', 'custom'] for t in body.get('tools', [])):
            raise ValueError('hosted tools forbidden')
        provider = r['provider']
        body['store'] = False
        body['service_tier'] = self.profile['serviceTier']
        # Deliberately conservative: all UTF-8 request bytes plus a fixed
        # framing allowance. No cached-input discount, hidden context or refund.
        input_upper = len(canonical(body)) + count * 32 + 16384 + opaque_upper
        token_output = r['tokenLimit'] - self.value['reservedTokens'] - input_upper
        micro_left = r['spendMicroUsd'] - self.value['reservedMicroUsd']
        money_output = (micro_left - input_upper * provider['inputMicroUsdPerToken']) // provider['outputMicroUsdPerToken']
        output = min(provider['maxOutputTokens'], token_output, money_output)
        if output < self.profile['minimumOutputTokens']:
            raise ReservationCapacityError(input_upper, token_output, money_output,
                                           self.profile['minimumOutputTokens'])
        body['max_output_tokens'] = output
        reserved = input_upper * provider['inputMicroUsdPerToken'] + output * provider['outputMicroUsdPerToken']
        self.value['reservedTokens'] += input_upper + output
        self.value['reservedMicroUsd'] += reserved
        self.value['requests'].append({'requestSha256': hashlib.sha256(canonical(body)).hexdigest(),
                                      'inputTokenUpperBound': input_upper,
                                      'maximumOutputTokens': output,
                                      'reservedMicroUsd': reserved})
        atomic(self.file, self.value)  # Before any upstream request, even failures.
        return canonical(body)


    def block(self):
        # Preserve the entire reservation, with no provider text or diagnostics.
        # A failed or unverified upstream outcome cannot trigger another call.
        self.value['blockedReason'] = 'provider-outcome-unverified'
        atomic(self.file, self.value)

    def observe(self, output, content_type, sent):
        try:
            self.observe_verified(output, content_type, sent)
        except Exception:
            self.block()
            raise ValueError('unverified provider outcome') from None

    def observe_verified(self, output, content_type, sent):
        """Bind stateless opaque replay to this broker's actually received bytes.

        Every item conservatively costs the entire previously reserved output
        cap again as input. No usage claim, remote ID lookup, caller-supplied
        hash or copied budget file authenticates opaque content.
        """
        reservation = self.value['requests'][-1]
        if reservation['requestSha256'] != hashlib.sha256(sent).hexdigest():
            raise ValueError('unreserved provider response')
        maximum = reservation['maximumOutputTokens']
        media_type = content_type.split(';', 1)[0].strip().lower()
        streamed_reasoning = []
        if media_type == 'text/event-stream':
            terminal = []
            for line in output.splitlines():
                if line.startswith(b'data:'):
                    data = line[5:].strip()
                    if data and data != b'[DONE]':
                        event = json.loads(data)
                        if not isinstance(event, dict) or event.get('type') == 'error':
                            raise ValueError('invalid provider event')
                        item = event.get('item')
                        if (self.request['model'] in ('muse-spark-1.3', 'muse-spark-1.3-contributor')
                                and event.get('type') == 'response.output_item.done'
                                and isinstance(item, dict) and item.get('type') == 'reasoning'):
                            streamed_reasoning.append((event.get('output_index'), item))
                        if event.get('type') in ('response.completed', 'response.incomplete', 'response.failed'):
                            response = event.get('response')
                            if (not isinstance(response, dict)
                                    or event['type'] != 'response.' + str(response.get('status'))):
                                raise ValueError('terminal event mismatch')
                            terminal.append(response)
            if len(terminal) != 1:
                raise ValueError('one terminal response required')
            response = terminal[0]
        elif media_type == 'application/json':
            response = json.loads(output)
        else:
            raise ValueError('unsupported provider content type')
        if (not isinstance(response, dict) or response.get('object') != 'response'
                or response.get('model') != self.request['model']
                or response.get('service_tier') != self.profile['serviceTier']
                or response.get('status') not in ('completed', 'incomplete')):
            raise ValueError('provider identity or outcome mismatch')
        usage = response.get('usage')
        if not isinstance(usage, dict):
            raise ValueError('provider usage unavailable')
        def tokens(name, source=usage):
            value = source.get(name)
            if type(value) is not int or value < 0:
                raise ValueError('invalid provider token accounting')
            return value
        used_input, used_output, total = tokens('input_tokens'), tokens('output_tokens'), tokens('total_tokens')
        meta = self.request['model'] in ('muse-spark-1.3', 'muse-spark-1.3-contributor')
        details = usage.get('input_tokens_details', {} if meta else None)
        if not isinstance(details, dict):
            raise ValueError('provider input accounting unavailable')
        cached = tokens('cached_tokens', {'cached_tokens': details.get('cached_tokens', 0)} if meta else details)
        written = tokens('cache_write_tokens', {'cache_write_tokens': details.get('cache_write_tokens', 0)})
        if (used_input > reservation['inputTokenUpperBound'] or used_output > maximum
                or total != used_input + used_output or cached + written > used_input
                or (meta and written != 0)):
            raise ValueError('provider usage exceeds reservation')
        # Cache reads and writes are already covered by the reviewed worst-case
        # input tariff. Do not refund reservations or claim a measured bill.
        # Meta can encrypt the SAME finalized reasoning item separately in its
        # item.done and terminal events. Codex replays item.done. Authenticate
        # both variants from these received bytes, only after terminal/usage
        # validation and exact item identity/content matching (except cipher).
        nodes = [response]
        indices = set()
        for index, item in streamed_reasoning:
            outputs = response.get('output')
            if (type(index) is not int or index < 0 or index in indices
                    or not isinstance(outputs, list) or index >= len(outputs)):
                raise ValueError('ambiguous streamed reasoning identity')
            indices.add(index)
            final = outputs[index]
            if (not isinstance(final, dict) or not isinstance(item.get('id'), str)
                    or not item['id'] or final.get('id') != item['id']
                    or canonical({k: v for k, v in final.items() if k != 'encrypted_content'})
                    != canonical({k: v for k, v in item.items() if k != 'encrypted_content'})):
                raise ValueError('streamed reasoning differs from terminal item')
            nodes.append(item)
        count = 0
        while nodes:
            item = nodes.pop()
            count += 1
            if count > 50000:
                raise ValueError('bounded provider response structure')
            if isinstance(item, dict):
                content = item.get('encrypted_content')
                if content is not None:
                    if item.get('type') != 'reasoning' or not isinstance(content, str):
                        raise ValueError('unsupported opaque provider output')
                    identity = hashlib.sha256(content.encode()).hexdigest()
                    self.value['opaqueInputs'][identity] = max(maximum, self.value['opaqueInputs'].get(identity, 0))
                nodes.extend(item.values())
            elif isinstance(item, list):
                nodes.extend(item)
        reservation['observedUsage'] = {'inputTokens': used_input, 'outputTokens': used_output,
                                        'totalTokens': total, 'cachedTokens': cached}
        reservation['responseStatus'] = response['status']
        reservation['serviceTier'] = response['service_tier']
        atomic(self.file, self.value)  # Retain validated usage/binding before exposing a response.


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('provider redirects forbidden')


def provider_request(body):
    # Existing host-managed Docker proxy injects real credentials. A reviewed
    # sentinel is not a real API key; no auth.json/key/home is copied to a guest.
    proxy = os.environ.get('HTTPS_PROXY', os.environ.get('https_proxy', ''))
    if not proxy.startswith('http://'):
        raise ValueError('reviewed credential proxy unavailable')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({'https': proxy}), NoRedirect())
    model = json.loads(body).get('model')
    if model not in PROFILES:
        raise ValueError('unapproved provider model')
    profile = PROFILES[model]
    request = urllib.request.Request(profile['endpoint'], data=body,
                                     headers={'Content-Type': 'application/json',
                                              'Authorization': 'Bearer ' + profile['sentinel']})
    with opener.open(request, timeout=30) as response:
        data = response.read(8_000_001)
        if len(data) > 8_000_000 or response.status != 200:
            raise ValueError('bounded provider response unavailable')
        return data, response.headers.get('Content-Type', 'application/json')


def serve(socket_path, reservations, upstream=provider_request, refusal=None):
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Never log headers, provider content, auth or private text.

        def do_POST(self):
            stage = 'http-preflight'
            try:
                size = int(self.headers.get('Content-Length', '-1'))
                if self.path != '/v1/responses' or not 0 <= size <= 1_048_576 or self.headers.get('Transfer-Encoding'):
                    raise ValueError('unsupported request')
                stage = 'reservation'
                body = reservations.reserve(self.rfile.read(size))
                stage = 'upstream'
                try:
                    output, content_type = upstream(body)  # Exactly one attempt.
                except Exception:
                    reservations.block()
                    raise
                stage = 'response-validation'
                reservations.observe(output, content_type, body)
                self.send_response(200)
                self.send_header('Content-Type', content_type)
            except Exception as error:
                if refusal is not None:
                    try:
                        refusal(error, stage)
                    except Exception:
                        pass  # Diagnostics cannot change the fixed denial envelope.
                output = b'{"error":{"message":"Bounded provider request unavailable"}}'
                self.send_response(403)
                self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(output)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(output)

    # Bind relative to the owned directory: AF_UNIX addresses are limited to
    # ~108 bytes even when the filesystem supports longer private test roots.
    server = socketserver.UnixStreamServer(socket_path.name, Handler, bind_and_activate=False)
    previous = os.open('.', os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.chdir(socket_path.parent)
        server.server_bind()
        server.server_activate()
    finally:
        os.fchdir(previous)
        os.close(previous)
    server.timeout = .1
    os.chmod(socket_path, 0o666)  # Parent mounted read-only; only this socket is exposed.
    return server
