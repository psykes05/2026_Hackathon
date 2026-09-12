/* THE THREE AGENTS. Same voice and shape as phase0-baseline.jsx: each returns
   a verdict plus a reason string naming the amounts/thresholds involved.
   The one behavioural change in Phase 1: the approval limit is now the
   learned thetaA instead of a frozen state.threshold. */

import { VENDOR_REGISTRY } from "./env.js";

export function intakeAgent(invoice) {
  const known = Object.prototype.hasOwnProperty.call(VENDOR_REGISTRY, invoice.vendor);
  return {
    agent: "Intake",
    verdict: known ? "known sender" : "unknown sender",
    senderKnown: known,
    reason: known
      ? `${invoice.vendor} appears in the vendor registry`
      : `no registry entry for ${invoice.vendor}`,
  };
}

export function vendorAgent(invoice, intake) {
  /* The baseline does not take Intake's word for it: it reads the
     human-signed registry entry directly, so the attestation roots in a
     person, at depth 1. */
  const entry = VENDOR_REGISTRY[invoice.vendor];
  if (!entry) {
    return {
      agent: "Vendor Verification",
      verdict: "suspicious",
      trustDepth: 0,
      trustRoot: "none",
      reason: "no human-signed registry entry found",
    };
  }
  return {
    agent: "Vendor Verification",
    verdict: "legitimate",
    trustDepth: 1,
    trustRoot: "human",
    reason: `registry entry signed by ${entry.signedBy} on ${entry.signedOn} (tax ID ${entry.taxId})`,
  };
}

export function approvalAgent(invoice, vendor, thetaA) {
  const independent = Object.prototype.hasOwnProperty.call(VENDOR_REGISTRY, invoice.vendor)
    ? "legitimate"
    : "suspicious";
  const agreement = independent === vendor.verdict;

  if (vendor.verdict !== "legitimate") {
    return {
      agent: "Approval",
      verdict: "routed to human",
      independent,
      agreement,
      humanTouched: true,
      reason: "vendor not verified — escalated regardless of amount",
    };
  }
  if (invoice.amount <= thetaA) {
    return {
      agent: "Approval",
      verdict: "auto-approved",
      independent,
      agreement,
      humanTouched: false,
      reason: `$${invoice.amount.toFixed(2)} is at or under the $${thetaA.toLocaleString("en-US")} auto-approve limit`,
    };
  }
  return {
    agent: "Approval",
    verdict: "routed to human",
    independent,
    agreement,
    humanTouched: true,
    reason: `$${invoice.amount.toFixed(2)} exceeds the $${thetaA.toLocaleString("en-US")} limit`,
  };
}
