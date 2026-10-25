export const MICROSOFT_OPERATION_ORIGIN='https://ops-int.example.com';
export const MICROSOFT_OPERATION_ID='11111111-1111-4111-8111-111111111111';
export const MICROSOFT_OPERATION_STATE=Buffer.alloc(32,1).toString('base64url');
export function microsoftOperationChallenge(origin=MICROSOFT_OPERATION_ORIGIN) {
  const url=new URL(`https://login.microsoftonline.com/${MICROSOFT_OPERATION_ID}/oauth2/v2.0/authorize`);
  const state=MICROSOFT_OPERATION_STATE;
  for (const [key,value] of Object.entries({ client_id: MICROSOFT_OPERATION_ID,scope: 'openid profile',
    redirect_uri: origin+'/api/v1/platform/auth/microsoft/operation/callback',
    response_type: 'code',response_mode: 'query',max_age: '0',prompt: 'login',state,nonce: state,code_challenge: state,code_challenge_method: 'S256',
    claims: JSON.stringify({ id_token: { auth_time: { essential: true },amr: { essential: true,values: ['mfa'] } } }) })) {
    url.searchParams.set(key,value);
  }
  return { status: 'microsoft_required',state,authorizationUrl: url.href,requestId: MICROSOFT_OPERATION_ID };
}
