interface BachsCheckoutEvent {
  type: string;
  data?: unknown;
}

interface BachsBrowserClient {
  Initialize(options?: { onEvent?: (event: BachsCheckoutEvent) => void }): void;
  Checkout: {
    open(options: { checkoutUrl: string }): Promise<unknown>;
  };
}

interface Window {
  Bachs?: BachsBrowserClient;
}
