const PLATFORM_ORIGIN='https://ops-int.example.com';
const RP_ID='ops-int.example.com';

export async function installQualifiedAuthenticator({ context,page,browserName,keys }) {
  if (keys.length!==2 || keys[0].credential.id===keys[1].credential.id) throw new Error('PROTECTED_AUTHENTICATOR_KEYS_INVALID');
  if (browserName==='chromium') {
    const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
    const { authenticatorId }=await cdp.send('WebAuthn.addVirtualAuthenticator',{ options: {
      protocol: 'ctap2',transport: 'internal',hasResidentKey: true,hasUserVerification: true,
      isUserVerified: true,automaticPresenceSimulation: true } });
    for (const key of keys) await cdp.send('WebAuthn.addCredential',{ authenticatorId,credential: {
      credentialId: Buffer.from(key.credential.id,'base64url').toString('base64'),isResidentCredential: true,rpId: RP_ID,
      privateKey: key.exportPrivateKey(),userHandle: Buffer.from(key.userHandle,'base64url').toString('base64'),signCount: 0,
    } });
    return Object.freeze({ mode: 'native-chromium-virtual-ctap2' });
  }
  if (browserName!=='webkit') throw new Error('PROTECTED_AUTHENTICATOR_ENGINE_INVALID');
  // WebKit test bridge only. Current actual document origin/RP/challenge and UV
  // are checked before signing; it proves real server verification and browser
  // cookie/navigation behavior, not WebKit's native WebAuthn implementation.
  let counter=0;
  await context.exposeBinding('__cmQualifiedSoftwareAssertion',({ frame },input)=>{
    if (new URL(frame.url()).origin!==PLATFORM_ORIGIN || input.rpId!==RP_ID || input.userVerification!=='required'
      || typeof input.challenge!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(input.challenge)
      || !Array.isArray(input.allowed) || !input.allowed.includes(keys[0].credential.id)) {
      throw new Error('PROTECTED_SOFTWARE_ASSERTION_ORIGIN_DENIED');
    }
    return keys[0].response('get',{ counter: ++counter,client: { challenge: input.challenge,origin: new URL(frame.url()).origin } });
  });
  await context.addInitScript(({ origin,rpId })=>{
    if (location.origin!==origin) return;
    const encode=buffer=>btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
    const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),character=>character.charCodeAt(0)).buffer;
    let credentials=navigator.credentials;
    if (!credentials) {
      credentials={};Object.defineProperty(navigator,'credentials',{ configurable: true,value: credentials });
    }
    Object.defineProperty(credentials,'get',{ configurable: true,value: async({ publicKey,signal })=>{
      if (signal?.aborted || publicKey.rpId!==rpId || !isSecureContext) throw new DOMException('Denied','NotAllowedError');
      const value=await globalThis.__cmQualifiedSoftwareAssertion({ rpId: publicKey.rpId,userVerification: publicKey.userVerification,
        challenge: encode(publicKey.challenge),allowed: (publicKey.allowCredentials ?? []).map(item=>encode(item.id)) });
      if (signal?.aborted) throw new DOMException('Aborted','AbortError');
      return { id: value.id,rawId: decode(value.rawId),type: 'public-key',authenticatorAttachment: 'platform',
        response: Object.fromEntries(Object.entries(value.response).map(([name,encoded])=>[name,decode(encoded)])),
        getClientExtensionResults: ()=>({}) };
    } });
  },{ origin: PLATFORM_ORIGIN,rpId: RP_ID });
  return Object.freeze({ mode: 'webkit-origin-bound-software-test-bridge' });
}
