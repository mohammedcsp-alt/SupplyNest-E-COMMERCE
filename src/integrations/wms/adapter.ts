import { CONTRACTS, type ContractName, type ContractPayload } from './contracts';

/**
 * WMS adapter (ADMIN-010). V1 CONTRACT: no network call of any kind.
 * - While `enabled` is false (the default and the only V1 configuration), EVERY method throws
 *   'WMS integration disabled'.
 * - When enabled (only possible through FEATURE_FLAG_WMS_INTEGRATION=true, which production refuses), it validates
 *   payloads against the contract schemas and records them in a local array. It still does not contact WMS.
 */
export const WMS_DISABLED_MESSAGE = 'WMS integration disabled';

export type WmsRecord<K extends ContractName = ContractName> = {
  contract: K;
  payload: ContractPayload<K>;
};

export class WmsAdapter {
  private readonly records: WmsRecord[] = [];

  constructor(private readonly opts: { enabled: boolean }) {}

  private assertEnabled(): void {
    if (!this.opts.enabled) throw new Error(WMS_DISABLED_MESSAGE);
  }

  /** Validates the payload against the named contract. Throws a ZodError for invalid payloads. */
  validate<K extends ContractName>(contract: K, payload: unknown): ContractPayload<K> {
    this.assertEnabled();
    return CONTRACTS[contract].parse(payload) as ContractPayload<K>;
  }

  /** Validates and records a payload in the local mock store. No outbound request is made. */
  record<K extends ContractName>(contract: K, payload: unknown): WmsRecord<K> {
    this.assertEnabled();
    const entry = { contract, payload: this.validate(contract, payload) } as WmsRecord<K>;
    this.records.push(entry);
    return entry;
  }

  /** Returns a copy of the local mock store. */
  list(): WmsRecord[] {
    this.assertEnabled();
    return this.records.map((r) => ({ ...r }));
  }

  /** Empties the local mock store. */
  clear(): void {
    this.assertEnabled();
    this.records.length = 0;
  }
}

/** The V1 application instance: disabled unless the feature flag is explicitly true. */
export function createWmsAdapter(enabled: boolean): WmsAdapter {
  return new WmsAdapter({ enabled });
}
