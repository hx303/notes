"""Check if Obsidian vault files have correct UTF-8 encoding"""
import os

vault = r'D:\Obsidian\notes'
target = 'AIGC'

for root, dirs, files in os.walk(vault):
    for f in files:
        if target in f and f.endswith('.md'):
            fp = os.path.join(root, f)
            with open(fp, 'rb') as fh:
                data = fh.read(500)
            
            # Search for correct UTF-8 '学术出版中AIGC'
            correct = '学术出版中AIGC'.encode('utf-8')
            idx = data.find(correct)
            
            print(f'File: {fp}')
            print(f'Correct UTF-8 title found: {idx >= 0} at offset {idx}')
            
            if idx >= 0:
                title_region = data[idx:idx+60]
                decoded = title_region.decode('utf-8')
                print(f'Title decoded: {repr(decoded)}')
            else:
                # Check for the garbled version
                # The mojibake: 'å­¦æœ¯å‡ºç‰ˆä¸­AIGC'
                # This is UTF-8 bytes interpreted as latin-1 then re-encoded as UTF-8
                garbled = '学术出版中AIGC'.encode('utf-8').decode('latin-1')
                idx2 = data.find(garbled.encode('utf-8'))
                print(f'Garbled version found: {idx2 >= 0}')
                print(f'First 200 bytes hex: {data[:200].hex()}')
                print(f'First 200 bytes as latin-1: {data[:200].decode("latin-1", errors="replace")}')
            print('---')
            break
