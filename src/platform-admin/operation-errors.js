// Shared outcome types: no runtime adapter, identity or authorization is selected.
export class PlatformMicrosoftOperationError extends Error {
  constructor(code='PLATFORM_MICROSOFT_OPERATION_FAILED') { super(code);this.name='PlatformMicrosoftOperationError';this.code=code; }
}
export class PlatformPasskeyOperationError extends Error {
  constructor(code='PLATFORM_PASSKEY_OPERATION_FAILED') { super(code);this.name='PlatformPasskeyOperationError';this.code=code; }
}
