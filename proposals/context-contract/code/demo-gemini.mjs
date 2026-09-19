import {readFileSync} from 'node:fs';
import {analyzeTurn} from './analyze-turn.mjs';
import {createGeminiGateway} from './gemini-gateway.mjs';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const message=read('./context-test-cases.json')[0].messages[0];
try {
  const gateway=createGeminiGateway({apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||'gemini-3.1-flash-lite'});
  const result=await analyzeTurn({context:read('./situation.empty.json'),messages:[],message},gateway);
  console.log(JSON.stringify(result,null,2));
  if(result.status!=='ok')process.exitCode=1;
}catch{console.error('Gemini 설정을 확인하세요. .env의 API 키와 모델 ID가 필요합니다.');process.exitCode=1;}
