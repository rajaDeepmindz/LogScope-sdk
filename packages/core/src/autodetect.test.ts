import {describe,it,expect} from 'vitest';
import {detectResponse as detect} from './autodetect';
describe('response auto detection',()=>{
 it('detects ADTS tests rawLogs',()=>{const payload={tests:[{trackName:'reverse s track',rawLogs:'2026-09-06 12:06:03,140 - adts-va.exe - INFO - [VMS] Started (vms.py:72)\n2026-09-06 12:06:04,140 - adts-va.exe - ERROR - [DET-PIPE] Failure (pipe.py:10)'}]};const r=detect(payload);expect(r.mapping.listPath).toBe('tests');expect(r.mapping.rawTextPath).toBe('rawLogs');expect(r.sample).toHaveLength(2);expect(r.sample[0].level).toBe('INFO');expect(r.sample[1].level).toBe('ERROR');expect(r.sample[0].service).toBe('adts-va.exe')});
 it('detects nested structured JSON',()=>{const r=detect({data:{logs:[{createdAt:'2026-11-02T11:00:00Z',severity:'WARN',message:'Retry'}]}});expect(r.mapping.listPath).toBe('data.logs');expect(r.sample[0].level).toBe('WARNING')});
});
