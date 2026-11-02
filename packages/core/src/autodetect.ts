import { normalizeResponse, parseText, pathValue, type FieldMapping, type LogEntry } from './index';

export interface DetectionResult {
  mapping: FieldMapping;
  format: 'nested-text' | 'structured-json' | 'plain-text' | 'unknown';
  confidence: number;
  recordCount: number;
  warnings: string[];
  sample: LogEntry[];
  metadata: Record<string, unknown>;
}
const listCandidates=['tests','data.logs','data.items','data.results','data.events','logs','items','results','events','records','data','payload.logs','payload.events','payload'];
const textFields=['rawLogs','raw_logs','logText','log_text','logs','content','text','message'];
const keyCandidates={timestamp:['timestamp','createdAt','created_at','time','datetime','date','ts'],level:['level','severity','logLevel','log_level','type'],message:['message','msg','text','description','content','log'],service:['service','serviceName','logger','module','source','component'],id:['id','_id','eventId','logId'],traceId:['traceId','trace_id','requestId']};
const isObj=(x:unknown):x is Record<string,unknown> => !!x && typeof x==='object' && !Array.isArray(x);
const pick=(obj:Record<string,unknown>,keys:string[])=>keys.find(k=>Object.prototype.hasOwnProperty.call(obj,k));
const hasLogPrefix=(v:string)=>/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d/m.test(v);

/** Infer response mapping without executing code from the response. Unknown fields remain in metadata. */
export function detectResponse(response:unknown,sourceId='auto'):DetectionResult {
 const warnings:string[]=[];
 let path=''; let items:unknown[]=[];
 if(typeof response==='string') items=[response];
 else if(Array.isArray(response)) items=response;
 else if(isObj(response)){
   for(const candidate of listCandidates){const value=pathValue(response,candidate);if(Array.isArray(value)&&value.length){path=candidate;items=value;break}}
   if(!items.length)items=[response];
 } else warnings.push('Response must be JSON or text.');
 const first=items.find(x=>x!==null&&x!==undefined);
 const mapping:FieldMapping={listPath:path||undefined};
 let format:DetectionResult['format']='unknown';let confidence=0.2;
 if(typeof first==='string') {format='plain-text';confidence=hasLogPrefix(first)?0.95:0.65}
 else if(isObj(first)) {
   const rawField=textFields.find(k=>typeof first[k]==='string' && hasLogPrefix(first[k] as string));
   if(rawField){mapping.rawTextPath=rawField;format='nested-text';confidence=0.98}
   else {const fields:NonNullable<FieldMapping['fields']>={};for(const [name,keys] of Object.entries(keyCandidates)){const field=pick(first,keys);if(field)(fields as Record<string,string>)[name]=field}mapping.fields=fields;format='structured-json';confidence=fields.message?0.95:0.55;if(!fields.message)warnings.push('Could not confidently detect the message field. Please configure it manually.')}
 }
 if(!items.length)warnings.push('No records found in the response.');
 if(!path&&isObj(response)&&isObj(first)&&first===response)warnings.push('No nested records array detected; treating the root object as one event.');
 const sample=normalizeResponse(response,sourceId,mapping).slice(0,150);
 const metadata=isObj(first)?Object.fromEntries(Object.entries(first).filter(([k,v])=>k!==mapping.rawTextPath&&typeof v!=='object'&&String(v).length<300)):{ };
 const recordCount=mapping.rawTextPath?items.reduce<number>((n,item)=>n+(isObj(item)&&typeof item[mapping.rawTextPath!]==='string'?parseText(item[mapping.rawTextPath!] as string).length:0),0):sample.length;
 return {mapping,format,confidence,recordCount,warnings,sample,metadata};
}
