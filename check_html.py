import os, sys
sys.stdout.reconfigure(encoding='utf-8')

for root, dirs, files in os.walk(r'G:\OpenClaw-Workspace\notes-website\public'):
    for f in files:
        if 'AIGC' in f and f.endswith('.html'):
            fp = os.path.join(root, f)
            with open(fp, 'rb') as fh:
                data = fh.read(2000)
            target = '\xe5\xad\xa6\xe6\x9c\xaf\xe5\x87\xba\xe7\x89\x88\xe4\xb8\xadAIGC'
            target_bytes = target.encode('utf-8') if isinstance(target, str) else target
            idx = data.find(target_bytes)
            print('Correct byte sequence found:', idx >= 0)
            if idx >= 0:
                print('OK:', data[idx:idx+60].decode('utf-8'))
            else:
                ts = data.find(b'<title>')
                te = data.find(b'</title>')
                raw = data[ts+7:te]
                print('Title hex:', raw.hex())
                print('Title utf8:', raw.decode('utf-8', errors='replace'))
            break
