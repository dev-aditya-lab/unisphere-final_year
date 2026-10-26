import payu from "./payu";

/**
 * The payment gateways this deployment can talk to, by id. PAYMENT_GATEWAY picks one.
 *
 * To add another gateway: write one adapter file in this folder (the contract is in lib/payments/gateway.js, a worked example
 * is in docs/PAYMENTS.md), import it here and list it. Nothing else in the app names a gateway.
 */
export const GATEWAYS = { [payu.id]: payu };
