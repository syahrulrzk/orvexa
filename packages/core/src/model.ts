export type ModelRequest={apiKey:string;model:string;instructions:string;input:string};
export type ModelResult={text:string;inputTokens:number;outputTokens:number};
export type ModelCall=(request:ModelRequest)=>Promise<ModelResult>;
export const callModel:ModelCall=async request=>{
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${request.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:request.model,instructions:request.instructions,input:request.input,max_output_tokens:1800,store:false}),signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error(`PROVIDER_HTTP_${response.status}`);
 const body=await response.json() as any;
 const text=(body.output??[]).filter((item:any)=>item.type==='message').flatMap((item:any)=>item.content??[]).filter((item:any)=>item.type==='output_text').map((item:any)=>item.text).join('\n');
 if(body.status!=='completed'||!text)throw new Error('PROVIDER_INCOMPLETE_RESPONSE');
 return {text,inputTokens:body.usage?.input_tokens??0,outputTokens:body.usage?.output_tokens??0};
};
