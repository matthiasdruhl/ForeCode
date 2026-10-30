"""Separate team-profile control, not installed or admitted by this repository.

Reuse the fixed supervisor/worker in an isolated module namespace. No changes to
the smoke helper, broker or worker. Host composition must establish inventory,
VM quotas, current exact authority and protected grader custody before dispatch.
This root helper is not an approval verifier or a public execution entry point.
"""
import hashlib
import json
import pathlib
import sys
import types

HERE = pathlib.Path(__file__).resolve().parent
base = types.ModuleType('team_supervisor_base')
base.__file__ = str(HERE / 'supervisor.py')
exec(compile((HERE / 'supervisor.py').read_bytes(), base.__file__, 'exec'), base.__dict__)
ROOT = pathlib.Path('/var/lib/forecode-team-agent')
base.ROOT = ROOT
base.LABEL = 'forecode.booking.team.agent'
TOOLS = {'shell', 'exec_command', 'write_stdin', 'apply_patch'}
TASK = 'fcd6f62dd7ca4c9713c230bd83cc4ede181a9a873c6698d2db2148285ea05883'


def exact_int(value, lower, upper):
    if type(value) is not int or not lower <= value <= upper:
        raise ValueError('unsupported integer limit')


class TeamReservations(base.budget.Reservations):
    def reserve(self, raw):
        r = self.request
        if (len(raw) > 1_048_576 or len(self.value['requests']) >= r['maxRequests']
                or len(self.value['requests']) >= r['maxIterations']):
            raise ValueError('team request or iteration ceiling')
        body = json.loads(raw)
        if not isinstance(body, dict):
            raise ValueError('provider object required')
        tools = body.get('tools', [])
        if not isinstance(tools, list):
            raise ValueError('tools array required')
        for tool in tools:
            if (not isinstance(tool, dict) or tool.get('type') not in ('custom', 'function')
                    or tool.get('name') not in TOOLS):
                raise ValueError('prohibited team capability')
        choice = body.get('tool_choice')
        if choice not in (None, 'auto', 'none', 'required'):
            raise ValueError('unsupported tool selection')
        return super().reserve(raw)


base.budget.Reservations = TeamReservations


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
    exact_int(e['tokenLimit'], 1, 1_000_000)
    exact_int(e['spendMicroUsd'], 1, 10_000_000)
    exact_int(r['maxRequests'], 1, 100)
    exact_int(r['maxOutputTokens'], 16, min(8192, e['tokenLimit']))
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

    def prepare_team(self, request, provider):
        transformed = preparation_request(request)
        if set(provider) != {'inputMicroUsdPerToken', 'outputMicroUsdPerToken'}:
            raise ValueError('fixed tariff fields required')
        exact_int(provider['inputMicroUsdPerToken'], 1, 1000)
        exact_int(provider['outputMicroUsdPerToken'], 1, 10000)
        transformed['provider'] = {**provider, 'endpoint': 'https://api.meta.ai/v1/responses',
                                   'maxOutputTokens': request['enforcement']['restrictions']['maxOutputTokens']}
        result = super().prepare(transformed)
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
        return result

    def finalize(self, run_id, nonce):
        result = super().finalize(run_id, nonce)
        _, state = self.state(run_id, nonce)
        result.update(requestSha256=state['request']['teamRequestSha256'], terminationConfirmed=True,
                      restartAbsenceConfirmed=True, exportWithoutGuestExecution=True)
        return result

    def cleanup(self, run_id, nonce):
        result = super().cleanup(run_id, nonce)
        return {'runId': result['runId'], 'nonce': nonce, 'absent': result['absent'],
                'restartAbsenceConfirmed': True}


def main():
    # No production installation/tariff composition has been independently
    # reviewed. In particular, stdin must never select a tariff or authority.
    # Importable mechanics below are for fixed no-inference controls only.
    raise ValueError('TEAM_PRODUCTION_COMPOSITION_NOT_INDEPENDENTLY_REVIEWED')


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        print('{"error":"TEAM_SUPERVISOR_NOT_ADMITTED"}')
        sys.exit(1)
