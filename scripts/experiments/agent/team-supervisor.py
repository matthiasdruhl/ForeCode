"""Separate team-profile control, not installed or admitted by this repository.

Reuse the fixed supervisor/worker in an isolated module namespace. No changes to
the smoke helper, broker or worker. Host composition must establish inventory,
VM quotas, current exact authority and protected grader custody before dispatch.
This root helper is not an approval verifier or a public execution entry point.
"""
import hashlib
import json
import os
import re
import shutil
import stat
import pathlib
import sys
import types
import time
import urllib.request
import urllib.error

HERE = pathlib.Path(__file__).resolve().parent
base = types.ModuleType('team_supervisor_base')
base.__file__ = str(HERE / 'supervisor.py')
exec(compile((HERE / 'supervisor.py').read_bytes(), base.__file__, 'exec'), base.__dict__)
ROOT = pathlib.Path('/var/lib/forecode-team-agent')
POLICY = pathlib.Path('/opt/forecode-agent/team-policy.json')
base.ROOT = ROOT
base.LABEL = 'forecode.booking.team.agent'
TOOLS = {'shell', 'exec_command', 'write_stdin', 'apply_patch'}
TASK = 'fcd6f62dd7ca4c9713c230bd83cc4ede181a9a873c6698d2db2148285ea05883'


def exact_int(value, lower, upper):
    if type(value) is not int or not lower <= value <= upper:
        raise ValueError('unsupported integer limit')


class TeamReservations(base.budget.Reservations):
    def __init__(self, directory, request):
        self.contract_clock = time.monotonic()
        self.contract_failed = False
        self.response_failed = False
        self.contract_stages = {}
        super().__init__(directory, request)

    def contract_event(self, stage, sent, details=None):
        # Append-only diagnostic observations, never admission/correctness
        # authority. Only fixed callers supply stages and closed projections.
        # A failed write latches before raising, including direct test callers.
        try:
            if self.contract_failed or stage not in (
                    'admitted', 'upstream-started', 'upstream-failed',
                    'response-received', 'response-accepted', 'response-rejected'):
                raise ValueError('invalid contract stage')
            ordinal = len(self.value['requests'])
            digest = hashlib.sha256(sent).hexdigest()
            if not ordinal or self.value['requests'][-1]['requestSha256'] != digest:
                raise ValueError('unreserved contract observation')
            previous = self.contract_stages.get(ordinal)
            allowed = {
                'admitted': (None,), 'upstream-started': ('admitted',),
                'upstream-failed': ('upstream-started',),
                # Direct filesystem controls may observe without transport.
                'response-received': ('admitted', 'upstream-started'),
                'response-accepted': ('response-received',),
                'response-rejected': ('response-received',),
            }
            if previous not in allowed[stage]:
                raise ValueError('out of order contract observation')
            value = {
                'schemaVersion': 'team-request-contract-observation.local.v1',
                'ordinal': ordinal, 'stage': stage, 'requestSha256': digest,
                'observedAtEpochMs': int(time.time() * 1000),
                'brokerElapsedMs': min(2**53-1, max(0, int((time.monotonic() - self.contract_clock) * 1000))),
                'responseValidated': stage == 'response-accepted',
                'details': details or {},
            }
            raw = base.budget.canonical(value)
            if len(raw) > 8192:
                raise ValueError('bounded contract observation')
            file = self.file.parent / f'request-{ordinal:04d}-{stage}.json'
            # Publish complete bytes without replacing existing evidence. A
            # crash leaves either a complete final record or a private .next;
            # a partial temporary record is never a lifecycle observation.
            temp = file.with_name(file.name + '.next')
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try:
                with os.fdopen(fd, 'wb') as out:
                    if out.write(raw) != len(raw):
                        raise OSError('incomplete diagnostic write')
                    out.flush()
                    os.fchmod(out.fileno(), 0o400)
                    os.fsync(out.fileno())
                os.link(temp, file, follow_symlinks=False)
                temp.unlink()
                parent = os.open(self.file.parent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(parent)
                finally:
                    os.close(parent)
            finally:
                if temp.exists():
                    temp.unlink()
            self.contract_stages[ordinal] = stage
        except Exception:
            self.contract_failed = True
            raise ValueError('team contract diagnostics unavailable') from None

    @staticmethod
    def kind_counts(items):
        # Never use untrusted names/types as persisted object keys.
        kinds = {'message', 'reasoning', 'function_call', 'function_call_output',
                 'custom_tool_call', 'custom_tool_call_output'}
        counts = {}
        for item in items[:4096]:
            kind = item.get('type') if isinstance(item, dict) else None
            kind = kind if isinstance(kind, str) and kind in kinds else 'other'
            counts[kind] = counts.get(kind, 0) + 1
        return {'counts': counts, 'truncated': len(items) > 4096}

    def request_contract(self, sent):
        # Inspect the final canonical bytes RETURNED by base.reserve, including
        # all normalization and actual conservative output-cap selection.
        body = json.loads(sent)
        ordinal = len(self.value['requests'])
        ceiling = min(self.request['maxRequests'], self.request['maxIterations'])
        remaining = ceiling - ordinal + 1
        closing = min(3, self.request.get('completionReserveRequests', 0))
        phase = {3: 'completion', 2: 'validation', 1: 'final'}.get(remaining, 'work') if remaining <= closing else 'work'
        instructions = body.get('instructions')
        items = body['input'] if isinstance(body['input'], list) else []
        tools = body.get('tools', [])
        return {
            'phase': phase, 'requestsRemainingAfterAdmission': ceiling - ordinal,
            'toolCount': len(tools), 'toolNames': sorted({t['name'] for t in tools}),
            'toolTypes': sorted({t['type'] for t in tools}),
            'toolChoice': body.get('tool_choice'),
            'inputKind': 'items' if isinstance(body['input'], list) else 'text',
            'inputItemCount': len(items), 'inputItemKinds': self.kind_counts(items),
            'instructionsBytes': len(instructions.encode()) if isinstance(instructions, str) else None,
            'instructionsSha256': hashlib.sha256(instructions.encode()).hexdigest() if isinstance(instructions, str) else None,
            'maxOutputTokens': body['max_output_tokens'],
            'maxRequests': self.request['maxRequests'], 'maxIterations': self.request['maxIterations'],
            'tokenLimit': self.request['tokenLimit'], 'spendMicroUsd': self.request['spendMicroUsd'],
            'nativeRolloutTokenLimit': min(self.request['tokenLimit'], 1_000_000),
            'deadlineEpochMs': int(self.request['deadline'] * 1000),
            'deadlineRemainingMs': max(0, int((self.request['deadline'] - time.time()) * 1000)),
        }

    def response_contract(self, output, content_type):
        # Shape/echo only, from an UNTRUSTED response. Do not log text,
        # arguments, usage, IDs or arbitrary provider names. Earlier SSE items
        # remain independently validated even when absent from the terminal.
        media = content_type.split(';', 1)[0].strip().lower()
        summary = {'observationOnly': True, 'responseSha256': hashlib.sha256(output).hexdigest(),
                   'responseBytes': len(output),
                   'contentType': media if media in ('application/json', 'text/event-stream') else 'other'}
        try:
            responses = []
            added, done = [], []
            if media == 'application/json':
                responses = [json.loads(output)]
            elif media == 'text/event-stream':
                for line in output.splitlines():
                    if line.startswith(b'data:') and line[5:].strip() not in (b'', b'[DONE]'):
                        event = json.loads(line[5:].strip())
                        if isinstance(event, dict):
                            if event.get('type') == 'response.output_item.added' and len(added) < 4097:
                                added.append(event.get('item'))
                            if event.get('type') == 'response.output_item.done' and len(done) < 4097:
                                done.append(event.get('item'))
                        if isinstance(event, dict) and event.get('type') in (
                                'response.completed', 'response.incomplete', 'response.failed'):
                            # More than one terminal is invalid; keep no unbounded list.
                            if responses:
                                return {**summary, 'terminalShape': 'multiple'}
                            responses.append(event.get('response'))
            summary.update(addedEventItemKinds=self.kind_counts(added),
                           doneEventItemKinds=self.kind_counts(done))
            if len(responses) != 1 or not isinstance(responses[0], dict):
                return {**summary, 'terminalShape': 'missing-or-malformed'}
            response = responses[0]
            items = response.get('output')
            instructions = response.get('instructions')
            return {**summary, 'terminalShape': 'observed-not-authenticated',
                    'outputItemKinds': self.kind_counts(items) if isinstance(items, list) else None,
                    'echoedToolsCount': len(response['tools']) if isinstance(response.get('tools'), list) else None,
                    'echoedToolChoice': 'auto' if response.get('tool_choice') == 'auto' else 'absent' if 'tool_choice' not in response else 'other',
                    'echoedInstructionsSha256': hashlib.sha256(instructions.encode()).hexdigest() if isinstance(instructions, str) else None}
        except (ValueError, TypeError, UnicodeError, RecursionError):
            return {**summary, 'terminalShape': 'malformed'}

    def record_refusal(self, error, stage, raw=None):
        # First refusal wins. Latch before disk I/O: a logging failure must not
        # authorize a later send. Parent is supervisor-owned, outside mounts.
        if getattr(self, 'local_refused', False):
            return
        self.local_refused = True
        codes = {
            'team request byte ceiling': 'request-bytes',
            'team request ceiling': 'request-count',
            'team iteration ceiling': 'iteration-count',
            'budget deadline or request limit': 'deadline-or-request-bytes',
            'input depth/size': 'history-nodes',
            'bounded team history structure': 'team-history-nodes',
            'opaque context not from this reserved attempt': 'unauthenticated-opaque-context',
            'prohibited team capability': 'tool-declaration',
            'prohibited team history capability': 'history-tool',
            'provider outcome requires owner review': 'provider-breaker',
        }
        projection = error.projection if isinstance(error, base.budget.ReservationCapacityError) else None
        code = codes.get(str(error), 'invalid-request' if stage == 'reservation' else stage)
        if isinstance(error, base.budget.ReservationCapacityError):
            minimum = projection['minimumOutputTokens']
            token = projection['tokenOutputCapacity'] < minimum
            money = projection['moneyOutputCapacity'] < minimum
            code = 'token-and-money-capacity' if token and money else 'token-capacity' if token else 'money-capacity'
        self.refusal_code = code
        value = {'schemaVersion': 'team-broker-refusal.local.v1', 'stage': stage, 'reasonCode': code,
                 'requestCount': len(self.value['requests']), 'maxRequests': self.request['maxRequests'],
                 'maxIterations': self.request['maxIterations'], 'reservedTokens': self.value['reservedTokens'],
                 'tokenLimit': self.request['tokenLimit'], 'reservedMicroUsd': self.value['reservedMicroUsd'],
                 'spendMicroUsd': self.request['spendMicroUsd'],
                 'deadlineReached': time.time() >= self.request['deadline'],
                 'lastAdmittedRequestSha256': self.value['requests'][-1]['requestSha256'] if self.value['requests'] else None,
                 'refusedRequestSha256': hashlib.sha256(raw).hexdigest() if isinstance(raw, bytes) else None,
                 'requestBytes': len(raw) if isinstance(raw, bytes) else None, 'projection': projection}
        # Immutable, fsynced, root-private and bounded; never exception text,
        # raw inputs, credentials, headers, native output or provider bodies.
        file = self.file.parent / 'broker-refusal.json'
        fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
        with os.fdopen(fd, 'wb') as out:
            out.write(base.budget.canonical(value))
            out.flush()
            os.fsync(out.fileno())
        directory = os.open(file.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def block(self):
        # Latch first. Diagnostics never authorize another provider request.
        error = sys.exc_info()[1]
        try:
            super().block()
        except Exception:
            pass  # The memory breaker is already set; retain the primary error.
        diagnostic = {
            'exceptionClass': type(error).__name__,
            'reasonSha256': hashlib.sha256(str(error).encode()).hexdigest(),
            'httpStatus': error.code if isinstance(error, urllib.error.HTTPError) else None,
            'requestCount': len(self.value['requests']),
        }
        try:
            base.budget.atomic(self.file.parent / 'provider-failure.json', diagnostic)
        except Exception:
            pass  # Failure diagnostics must not replace a transport/validation error.

    def observe(self, output, content_type, sent):
        self.response_rejection = 'response-validation'
        try:
            if not isinstance(output, bytes) or len(output) > 8_000_000:
                raise ValueError('bounded team provider response unavailable')
            self.contract_event('response-received', sent, self.response_contract(output, content_type))
            try:
                self.observe_verified(output, content_type, sent)
            except Exception:
                try:
                    self.block()
                except Exception:
                    pass  # Preserve the validation error across secondary storage failures.
                raise ValueError('unverified provider outcome') from None
            self.contract_event('response-accepted', sent)
            return None
        except Exception:
            # Contract-storage failure before validation also leaves the
            # provider outcome unverified. Validated usage, if already stored,
            # is never erased merely because a later diagnostic write failed.
            self.response_failed = True
            if self.value['blockedReason'] is None:
                try:
                    self.block()
                except Exception:
                    pass  # Memory latch survives even if all storage is unavailable.
            # Preserve bounded response bytes for owner review outside the
            # worker. Never store request headers, credentials or HTTP errors.
            try:
                if isinstance(output, bytes) and len(output) <= 8_000_000:
                    file = self.file.parent / 'unverified-response.bin'
                    fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
                    with os.fdopen(fd, 'wb') as out:
                        out.write(output)
                        out.flush()
                        os.fsync(out.fileno())
                    media = content_type.split(';', 1)[0].strip().lower()
                    base.budget.atomic(self.file.parent / 'unverified-response.json', {
                        'responseSha256': hashlib.sha256(output).hexdigest(),
                        'requestSha256': hashlib.sha256(sent).hexdigest(),
                        'contentType': media if media in ('application/json', 'text/event-stream') else 'other',
                        'bytes': len(output),
                    })
            except Exception:
                pass  # Preserve original rejection even when evidence storage fails.
            if not self.contract_failed:
                try:
                    self.contract_event('response-rejected', sent, {
                        'reasonCode': self.response_rejection})
                except ValueError:
                    pass  # Latch storage failure, but preserve the original rejection.
            raise

    def reserve(self, raw):
        if self.contract_failed or self.response_failed or getattr(self, 'local_refused', False):
            raise ValueError('team broker already refused')
        try:
            return self.reserve_team(raw)
        except Exception as error:
            try:
                self.record_refusal(error, 'reservation', raw)
            except Exception:
                pass  # The refusal latch is set before its own storage.
            raise

    def reserve_team(self, raw):
        r = self.request
        if len(raw) > 1_048_576:
            raise ValueError('team request byte ceiling')
        if len(self.value['requests']) >= r['maxRequests']:
            raise ValueError('team request ceiling')
        if len(self.value['requests']) >= r['maxIterations']:
            raise ValueError('team iteration ceiling')
        body = json.loads(raw)
        if not isinstance(body, dict):
            raise ValueError('provider object required')
        reasoning = body.get('reasoning', {})
        if (not isinstance(reasoning, dict)
                or set(reasoning) - {'effort', 'summary', 'generate_summary'}
                or reasoning.get('effort', 'high') != 'high'):
            raise ValueError('fixed team reasoning profile')
        # Optional summaries produced additional billed tokens beyond the
        # requested cap in actual Meta responses. Omit them; keep encrypted
        # replay and the strict reported-usage bound, with no token refunds.
        body['reasoning'] = {'effort': 'high'}
        tools = body.get('tools', [])
        if not isinstance(tools, list):
            raise ValueError('tools array required')
        for tool in tools:
            # Codex 0.165 advertises this client UI declaration even with
            # default-mode input disabled. It is never a team-model tool.
            # Remove only this exact declaration; all other unsupported tools
            # still refuse the whole request, before any reservation/send.
            if isinstance(tool, dict) and tool.get('type') == 'function' and tool.get('name') == 'request_user_input':
                continue
            if (not isinstance(tool, dict) or tool.get('type') not in ('custom', 'function')
                    or tool.get('name') not in TOOLS):
                raise ValueError('prohibited team capability')
        body['tools'] = [t for t in tools if t.get('name') != 'request_user_input']
        choice = body.get('tool_choice')
        if choice not in (None, 'auto'):
            raise ValueError('unsupported tool selection')
        # History cannot reintroduce a capability omitted from declarations.
        pending = [body.get('input')]
        visited = 0
        while pending:
            value = pending.pop()
            visited += 1
            if visited > 50000:
                raise ValueError('bounded team history structure')
            if isinstance(value, dict):
                if value.get('type') in ('function_call', 'custom_tool_call') and value.get('name') not in TOOLS:
                    raise ValueError('prohibited team history capability')
                pending.extend(value.values())
            elif isinstance(value, list):
                pending.extend(value)
        # Visible on every closing request, even without another shell exit.
        # Guidance consumes the same conservative reservation; it grants no
        # additional requests, tools, time, tokens or spending authority.
        remaining = min(r['maxRequests'], r['maxIterations']) - len(self.value['requests'])
        closing = min(3, r.get('completionReserveRequests', 0))
        if remaining <= closing:
            instructions = body.get('instructions')
            if instructions is None: instructions = ''
            if not isinstance(instructions, str): raise ValueError('team instructions must be text')
            guidance = {
                3: 'Completion phase: 3 admitted requests remain including this one. Finish essential repairs only; do not start a rewrite. Run public checks, then submit a final response within the remaining requests. The last request has tools disabled.',
                2: 'Validation phase: 2 admitted requests remain including this one. Use this last tool-enabled request for necessary validation or a minimal repair, then submit your final response. Disclose unchecked or unfinished work. No extra request is available.',
                1: 'Final admitted request: tools are disabled. Submit a final response and disclose unfinished work; no further call is available.',
            }[remaining]
            body['instructions'] = instructions + '\n' + guidance
        # Final response consumes a normal reservation inside every ceiling.
        if closing and remaining == 1:
            body['tools'] = []
            # Meta Responses supports auto, not tool_choice:none. Empty tools
            # advertise no new calls; returned calls are independently refused.
            body['tool_choice'] = 'auto'
        sent = super().reserve(base.budget.canonical(body))
        self.contract_event('admitted', sent, self.request_contract(sent))
        return sent

    def observe_verified(self, output, content_type, sent):
        # Enforce responses independently of advertised tools: a hallucinated
        # or substituted call never reaches the confined CLI. Base observe()
        # durably blocks subsequent sends when this validation raises.
        def item(value):
            if not isinstance(value, dict):
                raise ValueError('malformed team output item')
            kind = value.get('type')
            if kind in ('function_call', 'custom_tool_call'):
                if self.request.get('completionReserveRequests', 0) and len(self.value['requests']) == min(self.request['maxRequests'], self.request['maxIterations']):
                    self.response_rejection = 'final-tool-call'
                    raise ValueError('tool call during final response reserve')
                if value.get('name') not in TOOLS:
                    raise ValueError('prohibited team response capability')
            elif kind not in ('message', 'reasoning'):
                raise ValueError('unsupported team output item')

        def response(value):
            if not isinstance(value, dict) or not isinstance(value.get('output'), list):
                raise ValueError('malformed team response output')
            for value in value['output']:
                item(value)

        if content_type.split(';', 1)[0].strip().lower() == 'text/event-stream':
            terminal_seen = False
            for line in output.splitlines():
                if line.startswith(b'data:') and line[5:].strip() not in (b'', b'[DONE]'):
                    event = json.loads(line[5:].strip())
                    if isinstance(event, dict):
                        if terminal_seen:
                            raise ValueError('event after terminal team response')
                        if event.get('type') in ('response.output_item.added', 'response.output_item.done'):
                            item(event.get('item'))
                        terminal = event.get('type') in ('response.completed', 'response.incomplete', 'response.failed')
                        if terminal:
                            response(event.get('response'))
                            terminal_seen = True
                        elif isinstance(event.get('response'), dict) and 'output' in event['response']:
                            response(event['response'])
        elif content_type.split(';', 1)[0].strip().lower() == 'application/json':
            response(json.loads(output))
        return super().observe_verified(output, content_type, sent)


base.budget.Reservations = TeamReservations


def team_provider_request(body, deadline):
    # Full implementation responses can exceed the smoke's fixed30s socket
    # timeout. Keep this trusted transport bounded by the task's hard deadline
    # and a120s socket timeout; the independent supervisor still kills the
    # complete owned group at the absolute deadline.
    remaining = deadline - time.time()
    if remaining <= 0:
        raise ValueError('team provider deadline')
    proxy = os.environ.get('HTTPS_PROXY', os.environ.get('https_proxy', ''))
    if not proxy.startswith('http://'):
        raise ValueError('reviewed credential proxy unavailable')
    model = json.loads(body).get('model')
    if model not in ('muse-spark-1.3', 'muse-spark-1.3-contributor'):
        raise ValueError('fixed team provider model')
    profile = base.budget.PROFILES[model]
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({'https': proxy}), base.budget.NoRedirect())
    request = urllib.request.Request(profile['endpoint'], data=body, headers={
        'Content-Type': 'application/json', 'Authorization': 'Bearer ' + profile['sentinel'],
    })
    with opener.open(request, timeout=min(120, remaining)) as response:
        data = response.read(8_000_001)
        if len(data) > 8_000_000 or response.status != 200:
            raise ValueError('bounded team provider response unavailable')
        return data, response.headers.get('Content-Type', 'application/json')


_base_serve = base.budget.serve


def serve_team(socket_path, reservations, upstream=None):
    # The optional callable is the existing explicit no-inference test seam;
    # production dispatch accepts no request-selected callable or endpoint.
    if upstream is None:
        upstream = lambda body: team_provider_request(body, reservations.request['deadline'])
    def observed_upstream(body):
        reservations.contract_event('upstream-started', body)
        try:
            output, content_type = upstream(body)
            # Release only the media type validated by the broker, never raw
            # provider header parameters/line breaks into the local HTTP reply.
            return output, content_type.split(';', 1)[0].strip().lower()
        except Exception:
            try:
                reservations.contract_event('upstream-failed', body)
            except ValueError:
                pass  # Storage failure latches; preserve the original transport error.
            raise
    server = _base_serve(socket_path, reservations, observed_upstream, reservations.record_refusal)
    handler = server.RequestHandlerClass
    class TeamHandler(handler):
        def end_headers(self):
            code = getattr(reservations, 'refusal_code', None)
            if code in ('request-count', 'iteration-count', 'token-capacity', 'money-capacity', 'token-and-money-capacity', 'deadline-or-request-bytes'):
                self.send_header('X-Forecode-Stop', code)
            super().end_headers()
    server.RequestHandlerClass = TeamHandler
    return server


base.budget.serve = serve_team


def preparation_request(request):
    if set(request) != {'runId', 'nonce', 'studyId', 'variant', 'sourceCommit',
                        'sourceTreeSha256', 'sharedTaskSha256', 'enforcement', 'candidate'}:
        raise ValueError('closed team request required')
    e = request['enforcement']
    if (e['schemaVersion'] != 'supervised-team-enforcement.local.v1'
            or e['taskSha256'] != TASK or e['agent'] != 'codex-supervised-team-v1'
            or e['model'] not in ('muse-spark-1.3', 'muse-spark-1.3-contributor')
            or e['iterationUnit'] != 'upstream_responses_request' or e['tools'] != ['source-shell']
            or set(e['providerTools']) != TOOLS
            or request['variant'] not in ('A', 'B')):
        raise ValueError('fixed team profile required')
    r, resources = e['restrictions'], e['resources']
    if (set(r) != {'writablePaths', 'network', 'credentials', 'maxRequests', 'maxOutputTokens'}
            or r['writablePaths'] != ['src/'] or r['network'] != 'none'
            or r['credentials'] != 'trusted_broker_only'
            or resources['cpus'] != 1 or resources['memoryMiB'] != 768 or resources['pids'] != 128):
        raise ValueError('unsupported confinement')
    exact_int(e['maxIterations'], 1, 100)
    exact_int(e['maxSeconds'], 1, 600)
    exact_int(e['tokenLimit'], 1, 32_000_000)
    native_limit = min(e['tokenLimit'], 1_000_000)
    if e.get('nativeRolloutTokenLimit', native_limit) != native_limit:
        raise ValueError('fixed native rollout guard')
    exact_int(e['spendMicroUsd'], 1, 40_000_000)
    exact_int(r['maxRequests'], 1, 100)
    completion_reserve = min(3, e['maxIterations'], r['maxRequests'])
    if 'completionReserveRequests' in e: exact_int(e['completionReserveRequests'], 1, 3)
    if e.get('completionReserveRequests', completion_reserve) != completion_reserve:
        raise ValueError('fixed completion reserve')
    exact_int(r['maxOutputTokens'], 16, min(32768, e['tokenLimit']))
    exact_int(resources['outputBytes'], 1024, 8_000_000)
    candidate = request['candidate']
    manifest = [{'path': f['path'], 'sha256': hashlib.sha256(base.base64.b64decode(f['base64'], validate=True)).hexdigest()}
                for f in candidate['files']]
    manifest.sort(key=lambda f: f['path'])
    if base.digest(manifest) != request['sourceTreeSha256']:
        raise ValueError('starting tree changed')
    # The host commits the complete public task and adapter in this exact prompt.
    prompt = json.loads(e['prompt'])
    if set(prompt) != {'task', 'prompt', 'adapterInstructions', 'scenario'} or base.digest(prompt['task']) != TASK:
        raise ValueError('full frozen task absent')
    return {
        'runId': request['runId'], 'nonce': request['nonce'], 'candidate': candidate,
        'prompt': e['prompt'], 'model': e['model'], 'tokenLimit': e['tokenLimit'],
        'spendMicroUsd': e['spendMicroUsd'], 'maxSeconds': e['maxSeconds'],
        'maxOutputBytes': resources['outputBytes'], 'maxRequests': r['maxRequests'],
        'maxIterations': e['maxIterations'],
        'completionReserveRequests': completion_reserve,
        'workerImage': e['runtime']['workerImage'],
        'codexBinarySha256': e['runtime']['agentBinarySha256'],
        'agentConfigSha256': e['agentConfigSha256'], 'workerNodeSha256': e['runtime']['nodeSha256'],
        # Exact conservative tariffs are provided by the independently admitted
        # installation, never accepted from a worker or inferred from model text.
        'teamRequestSha256': base.digest(request),
    }


class TeamSupervisor(base.Supervisor):
    def __init__(self, root=ROOT, docker=base.command, boot=base.boot_id):
        super().__init__(root, docker, boot)

    def writable_mounts(self):
        return (*super().writable_mounts(), '/work')

    def worker_args(self, run_id, image):
        p, state = self.state(run_id, json.loads(base.read_regular(self.directory(run_id) / 'state.json'))['nonce'])
        task = json.loads(base.read_regular(p / 'task.json'))
        task.update(teamWorkflow='public-v2', deadline=state.get('deadline', time.time() + state['request']['maxSeconds']), maxRequests=min(state['request']['maxRequests'], state['request']['maxIterations']), completionReserveRequests=state['request']['completionReserveRequests'])
        base.budget.atomic(p / 'task.json', task)
        os.chmod(p / 'task.json', 0o444)
        args = super().worker_args(run_id, image)
        at = args.index('--entrypoint')
        for name in ['team-worker.mjs', 'team-public-checks.mjs', 'team-public-session.mjs', 'team-public-boundary.mjs', 'team-workflow.mjs', 'team-source-write.mjs', 'team-shell-hook.sh']:
            args[at:at] = ['--mount', 'type=bind,src=' + str(HERE / name) + ',dst=/run/' + name + ',readonly']
            at += 2
        args[at:at] = ['--tmpfs', '/work:rw,nosuid,nodev,size=256m,mode=1777']
        args[-1] = '/run/team-worker.mjs'
        return args

    def prepare_team(self, request, provider):
        transformed = preparation_request(request)
        if set(provider) != {'inputMicroUsdPerToken', 'outputMicroUsdPerToken'}:
            raise ValueError('fixed tariff fields required')
        exact_int(provider['inputMicroUsdPerToken'], 1, 1000)
        exact_int(provider['outputMicroUsdPerToken'], 1, 10000)
        transformed['provider'] = {**provider, 'endpoint': 'https://api.meta.ai/v1/responses',
                                   'maxOutputTokens': request['enforcement']['restrictions']['maxOutputTokens']}
        result = super().prepare(transformed)
        # The unchanged smoke bridge validates a1M native rollout counter.
        # Keep that stricter actual-token guard while the outside-worker
        # broker separately reserves up to32M worst-case byte/opaque tokens.
        native_limit = min(transformed['tokenLimit'], 1_000_000)
        if native_limit != transformed['tokenLimit']:
            p = self.directory(request['runId'])
            task = json.loads(base.read_regular(p / 'task.json'))
            if task['tokenLimit'] != transformed['tokenLimit']:
                raise ValueError('native task mapping changed')
            task['tokenLimit'] = native_limit
            temp = p / 'native-task.next'
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o444)
            with os.fdopen(fd, 'wb') as out:
                out.write(base.budget.canonical(task))
                out.flush()
                os.fsync(out.fileno())
            os.replace(temp, p / 'task.json')
            directory = os.open(p, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        # Persist the reservation directory before any later start can fork.
        parent = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
        return {**result, 'nonce': request['nonce'], 'requestSha256': base.digest(request)}

    def status(self, run_id, nonce):
        result = super().status(run_id, nonce)
        _, state = self.state(run_id, nonce)
        result['requestSha256'] = state['request']['teamRequestSha256']
        # Base drive only reaches terminated after owned force-removal.
        if result['stage'] == 'terminated':
            if self.owned(run_id):
                raise ValueError('worker resurrection')
            result.update(terminationConfirmed=True, restartAbsenceConfirmed=True)
            p = self.directory(run_id)
            refusal = p / 'broker-refusal.json'
            if refusal.exists() or refusal.is_symlink():
                info = refusal.lstat()
                if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o400:
                    raise ValueError('immutable broker refusal required')
                raw = base.read_regular(refusal, 8192)
                observation = json.loads(raw)
                if (observation['schemaVersion'] != 'team-broker-refusal.local.v1'
                        or observation['maxRequests'] != state['request']['maxRequests']
                        or observation['maxIterations'] != state['request']['maxIterations']
                        or type(observation['requestCount']) is not int
                        or not 0 <= observation['requestCount'] <= min(observation['maxRequests'], observation['maxIterations'])):
                    raise ValueError('broker refusal binding changed')
                result['brokerStop'] = {'reasonCode': observation['reasonCode'], 'requestCount': observation['requestCount'],
                                        'refusalSha256': hashlib.sha256(raw).hexdigest()}
        return result

    def finalize(self, run_id, nonce):
        try:
            result = super().finalize(run_id, nonce, allow_interrupted=True)
        except BaseException as error:
            # Retain a terminal export failure before host-owned cleanup.
            # Refusing a replay of an already sealed run does not invalidate it.
            _, state = self.state(run_id, nonce)
            if state['stage'] not in ('sealed', 'cleaned'):
                self.record_failure(run_id, nonce, error)
            raise
        _, state = self.state(run_id, nonce)
        result.update(requestSha256=state['request']['teamRequestSha256'], terminationConfirmed=True,
                      restartAbsenceConfirmed=True, exportWithoutGuestExecution=True)
        readiness = self.public_readiness(run_id, nonce, result['candidateSha256'])
        result['publicReadiness'] = readiness
        with self.lock(run_id):
            p, state = self.state(run_id, nonce)
            state['publicReadiness'] = readiness
            base.budget.atomic(p / 'state.json', state)
            base.budget.atomic(p / 'public-readiness.json', readiness)
        return result

    def public_readiness(self, run_id, nonce, candidate_sha256):
        # A second, confined readonly guest executes sealed source. Worker text
        # and advisory checkpoint files cannot authorize READY. No paid transport.
        p, state = self.state(run_id, nonce)
        result = {'status': 'NOT_CHECKED', 'reason': 'deadline', 'candidateSha256': candidate_sha256}
        remaining = min(180, state.get('deadline', 0) - time.time())
        if remaining < 1:
            return result
        args = super().worker_args(run_id, state['request']['workerImage'])
        at = args.index('--entrypoint')
        # Remove gateway/task/native/config and writable src mounts. Read sealed
        # source only; checks have their own scratch and no credential socket.
        cleaned = []
        index = 0
        while index < len(args):
            if args[index] == '--mount':
                mount = args[index + 1]
                if 'dst=/workspace,' in mount:
                    cleaned += ['--mount', 'type=bind,src=' + str(p / 'sealed') + ',dst=/workspace,readonly']
                index += 2
                continue
            cleaned.append(args[index]); index += 1
        args = cleaned
        args[args.index('--name') + 1] = 'forecode-public-ready-' + run_id
        args[args.index('--label') + 1] = 'forecode.booking.team.public=' + run_id
        at = args.index('--entrypoint')
        for name in ['team-public-checks.mjs', 'team-public-session.mjs', 'team-public-boundary.mjs']:
            args[at:at] = ['--mount', 'type=bind,src=' + str(HERE / name) + ',dst=/run/' + name + ',readonly']
            at += 2
        args[at:at] = ['--tmpfs', '/work:rw,nosuid,nodev,size=256m,mode=1777',
                       '--env', 'FORECODE_DEADLINE=' + str(state['deadline'])]
        args[-1] = '/run/team-public-checks.mjs'
        cid = None
        # Sealed directories are owner-private; a dedicated root-owned readonly
        # copy is made traversable for UID1000, never the retained private seal.
        public = p / 'public-source'
        try:
            shutil.copytree(p / 'sealed', public)
            for parent, _, files in os.walk(public):
                os.chmod(parent, 0o755)
                for name in files: os.chmod(pathlib.Path(parent) / name, 0o444)
            args = [a.replace(str(p / 'sealed') + ',dst=', str(public) + ',dst=') for a in args]
            cid = self.docker(args).decode().strip()
            with self.lock(run_id):
                _, current = self.state(run_id, nonce)
                current['publicContainerId'] = cid
                base.budget.atomic(p / 'state.json', current)
            remaining = min(180, state['deadline'] - time.time())
            if remaining <= 0:
                return result
            output = self.docker(['start', '--attach', cid], timeout=remaining)
            result.update(status='READY', reason='public-checks-passed', outputSha256=hashlib.sha256(output).hexdigest())
        except Exception as error:
            result.update(status='BLOCKED', reason='public-checks-failed-or-interrupted', errorClass=type(error).__name__ if type(error).__name__ in ['ValueError', 'TimeoutExpired', 'OSError'] else 'Exception')
        finally:
            # Failed candidates stay sealed. Removal failure is terminal and
            # retained before the ordinary owned cleanup gets another chance.
            try:
                if cid: self.remove(run_id)
            except BaseException as error:
                self.record_failure(run_id, nonce, error)
                raise
            finally:
                if public.exists(): shutil.rmtree(public)
        return result

    def remove_public(self, run_id):
        p = self.directory(run_id)
        file = p / 'state.json'
        state = json.loads(base.read_regular(file)) if file.exists() else {}
        ids = self.docker(['ps', '-aq', '--filter', 'label=forecode.booking.team.public=' + run_id]).decode().split()
        if len(ids) > 1:
            raise ValueError('extra public readiness containers')
        for cid in ids:
            info = json.loads(self.docker(['inspect', cid]))[0]
            if (info['Name'] != '/forecode-public-ready-' + run_id
                    or info['Config']['Labels'].get('forecode.booking.team.public') != run_id
                    or (state.get('publicContainerId') and info['Id'] != state['publicContainerId'])):
                raise ValueError('public readiness container ownership changed')
            self.docker(['rm', '--force', info['Id']])
        if self.docker(['ps', '-aq', '--filter', 'label=forecode.booking.team.public=' + run_id]).strip():
            raise ValueError('public readiness worker remains')

    def remove(self, run_id):
        result = super().remove(run_id)
        self.remove_public(run_id)
        return result

    def retain_cleanup_source(self, run_id, nonce):
        # Cleanup may be the only path after cancellation, host timeout or a
        # finalization error. Capture inert bytes AFTER the base helper has
        # killed the owned process groups and removed all workers. This is a
        # private recovery snapshot, never a finalized/graded candidate.
        with self.lock(run_id):
            p, state = self.state(run_id, nonce)
            source = p / 'source'
            if not source.exists() and not source.is_symlink():
                return
            candidate = base.capture(source, run_id)
            record = {'kind': 'cleanup-source-snapshot.local.v1', 'runId': run_id,
                      'requestSha256': state['requestSha256'], 'candidate': candidate,
                      'candidateSha256': base.digest(candidate),
                      'protectedCorrectness': 'NOT_ESTABLISHED'}
            raw = base.budget.canonical(record)
            if len(raw) > 12_000_000:
                raise ValueError('cleanup source archive bound')
            file = p / 'cleanup-source.json'
            if file.exists() or file.is_symlink():
                if (stat.S_IMODE(file.lstat().st_mode) != 0o400
                        or base.read_regular(file, 12_000_000) != raw):
                    raise ValueError('cleanup source archive changed')
            else:
                fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
                with os.fdopen(fd, 'wb') as out:
                    out.write(raw)
                    out.flush()
                    os.fsync(out.fileno())
                directory = os.open(p, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)

    def cleanup(self, run_id, nonce):
        result = super().cleanup(run_id, nonce)
        try:
            self.retain_cleanup_source(run_id, nonce)
        except BaseException as error:
            # Retain source scratch on an unsafe tree/storage failure. The
            # host must retain its lease and stop; no silent evidence loss.
            self.record_failure(run_id, nonce, error)
            raise
        # Only after trusted group termination/removal; retain durable state and
        # budget/evidence records, but remove all run-owned runtime scratch.
        with self.lock(run_id):
            p, state = self.state(run_id, nonce)
            for name in ['source', 'sealed', 'gateway', 'public-source']:
                target = p / name
                if target.is_symlink():
                    raise ValueError('cleanup scratch alias')
                if target.exists():
                    for parent, _, _ in os.walk(target):
                        os.chmod(parent, 0o700)
                    shutil.rmtree(target)
            task = p / 'task.json'
            if task.exists() or task.is_symlink():
                if task.is_symlink():
                    raise ValueError('cleanup task alias')
                task.unlink()
            if any((p / name).exists() for name in ['source', 'sealed', 'gateway', 'public-source', 'task.json']):
                raise ValueError('runtime scratch remains')
            state['scratchRemoved'] = True
            base.budget.atomic(p / 'state.json', state)
        return {'runId': result['runId'], 'nonce': nonce, 'absent': result['absent'],
                'restartAbsenceConfirmed': True, 'scratchRemoved': True}


def load_policy(file=POLICY, owner_uid=0):
    file = pathlib.Path(file)
    if file.resolve() != file:
        raise ValueError('installed policy alias')
    for parent in [file.parent, file.parent.parent]:
        info = parent.lstat()
        if parent.is_symlink() or info.st_uid != owner_uid or info.st_mode & 0o022:
            raise ValueError('installed policy parent custody')
    info = file.lstat()
    if info.st_uid != owner_uid or stat.S_IMODE(info.st_mode) != 0o400:
        raise ValueError('installed policy custody')
    policy = json.loads(base.read_regular(file, 1_048_576))
    if (set(policy) != {'schemaVersion', 'enabled', 'implementationSha256', 'enforcementSha256',
                       'studyId', 'arms', 'provider'}
            or policy['schemaVersion'] != 'supervised-team-installed-policy.v1'
            or policy['enabled'] is not True
            or not re.fullmatch(r'[a-f0-9]{64}', policy['implementationSha256'])
            or not re.fullmatch(r'[a-f0-9]{64}', policy['enforcementSha256'])
            or len(policy['arms']) != 2
            or {a['variant'] for a in policy['arms']} != {'A', 'B'}
            or len({a['runId'] for a in policy['arms']}) != 2):
        raise ValueError('exact installed policy unavailable')
    if set(policy['provider']) != {'inputMicroUsdPerToken', 'outputMicroUsdPerToken'}:
        raise ValueError('installed tariff fields')
    exact_int(policy['provider']['inputMicroUsdPerToken'], 1, 1000)
    exact_int(policy['provider']['outputMicroUsdPerToken'], 1, 10000)
    fields = {'variant', 'runId', 'sourceCommit', 'sourceTreeSha256', 'sharedTaskSha256'}
    for arm in policy['arms']:
        if (set(arm) != fields
                or not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', arm['runId'])
                or not re.fullmatch(r'[a-f0-9]{40}', arm['sourceCommit'])
                or any(not re.fullmatch(r'[a-f0-9]{64}', arm[k]) for k in ['sourceTreeSha256', 'sharedTaskSha256'])):
            raise ValueError('installed arm identity')
    return policy


def dispatch(request, supervisor, policy):
    operation = request['operation']
    if operation == 'prepare':
        if set(request) != {'operation', 'request'}:
            raise ValueError('closed preparation command')
        body = request['request']
        arm = next((a for a in policy['arms'] if a['runId'] == body['runId']), None)
        if (arm is None or body['studyId'] != policy['studyId']
                or base.digest(body['enforcement']) != policy['enforcementSha256']
                or any(body[k] != arm[k] for k in ['runId', 'variant', 'sourceCommit',
                                                  'sourceTreeSha256', 'sharedTaskSha256'])):
            raise ValueError('exact installed study/run/source/conditions mismatch')
        return supervisor.prepare_team(body, policy['provider'])
    if (set(request) != {'operation', 'runId', 'nonce'}
            or operation not in ['start', 'status', 'finalize', 'cleanup']
            or request['runId'] not in {a['runId'] for a in policy['arms']}):
        raise ValueError('fixed owned team command required')
    # Host authority expiry/revocation does not prevent owned cleanup. The
    # installation/policy must remain the same pinned immutable installation.
    return getattr(supervisor, operation)(request['runId'], request['nonce'])


def main():
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise ValueError('trusted Linux root helper required')
    info = ROOT.lstat()  # Installation only; runtime never provisions its root.
    if ROOT.is_symlink() or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError('team supervisor state custody')
    raw = sys.stdin.buffer.read(12_000_001)
    if len(raw) > 12_000_000:
        raise ValueError('bounded team input')
    request = json.loads(raw)
    policy = load_policy()
    result = dispatch(request, TeamSupervisor(), policy)
    print(json.dumps(result, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        print('{"error":"TEAM_SUPERVISOR_NOT_ADMITTED"}')
        sys.exit(1)
