#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Stitch MCP 直连工具(JSON-RPC over HTTPS,走系统代理)"""
import json, sys, os, urllib.request

TOKEN = os.environ.get('STITCH_ACCESS_TOKEN', '')
URL = 'https://stitch.googleapis.com/mcp'
PROXY = 'http://127.0.0.1:7897'

def call(method, params, tool=None):
    body = {'jsonrpc': '2.0', 'method': method, 'params': params, 'id': 1}
    if tool:
        body['params'] = {'name': tool, 'arguments': params}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={
        'Authorization': f'Bearer {TOKEN}',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
    })
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({'https': PROXY, 'http': PROXY}))
    with opener.open(req, timeout=180) as r:
        raw = r.read().decode('utf-8')
    # SSE 或 JSON
    for line in raw.split('\n'):
        if line.startswith('data:'):
            raw = line[5:].strip()
            break
    return json.loads(raw)

def tool(name, **args):
    resp = call('tools/call', args, tool=name)
    if 'error' in resp:
        raise RuntimeError(json.dumps(resp['error'], ensure_ascii=False)[:300])
    return resp['result']

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'list-projects':
        r = tool('list_projects')
        print(json.dumps(r, ensure_ascii=False, indent=2)[:3000])
    elif cmd == 'schema':
        # 查某工具的输入 schema
        r = call('tools/list', {})
        for t in r['result']['tools']:
            if t['name'] == sys.argv[2]:
                print(json.dumps(t['inputSchema'], ensure_ascii=False, indent=2)[:2500])
                break
    elif cmd == 'call':
        # call <tool> '<json-args>'
        r = tool(sys.argv[2], **json.loads(sys.argv[3]))
        print(json.dumps(r, ensure_ascii=False, indent=2)[:4000])
