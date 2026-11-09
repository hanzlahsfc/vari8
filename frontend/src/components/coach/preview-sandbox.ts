/**
 * Read-only preview sandbox for the setup editor.
 *
 * The sandbox is a deep copy of the live coach state with one sample athlete's
 * assignment swapped for the draft template. Nothing here mutates the source
 * state, so edits made inside the preview are discarded with the provider.
 */

import { trackerConfig } from "../client-app/tracker-config";
import { createExampleClient } from "./client-tracker-preview/example-client";
import {
  type CoachClient,
  type CoachState,
  seedState,
  type Template,
  TODAY,
} from "./model";
import { templateSetup } from "./template-setup";

export const PREVIEW_CLIENT_ID = "client-007";

export type PreviewSandbox = {
  state: CoachState;
  client: CoachClient;
  variantId: string;
};

/**
 * Build the isolated state used by the preview.
 *
 * - the source state is cloned before anything changes;
 * - the sample athlete is `client-007` (Amara) when present, otherwise an
 *   example athlete built from the first available client;
 * - the sample's assignment snapshot is the draft template with `variantId`
 *   selected, while their plans, history and habits stay untouched.
 */
export function buildPreviewState(
  base: CoachState,
  template: Template,
  variantId: string,
  preferredClient?: CoachClient,
): PreviewSandbox {
  const state = structuredClone(base);
  // Preview follows the draft's configured defaults, not the coach-wide
  // order/compare overrides left behind by browsing a real client.
  state.timelineOrder = undefined;
  state.timelineCompare = undefined;
  const variant = templateSetup(template, variantId);
  const preferredIndex = preferredClient
    ? state.clients.findIndex((client) => client.id === preferredClient.id)
    : -1;
  const sampleIndex =
    preferredIndex >= 0
      ? preferredIndex
      : state.clients.findIndex((client) => client.id === PREVIEW_CLIENT_ID);
  const source =
    (sampleIndex >= 0 ? state.clients[sampleIndex] : preferredClient) ??
    state.clients[0] ??
    seedState().clients[0];
  const sample =
    sampleIndex >= 0 || preferredClient
      ? structuredClone(
          sampleIndex >= 0
            ? state.clients[sampleIndex]
            : (preferredClient as CoachClient),
        )
      : createExampleClient(source, trackerConfig(variant), TODAY);
  const snapshot = structuredClone(template);
  snapshot.defaultVariant = variant.id;
  const client: CoachClient = {
    ...sample,
    assignment: {
      templateId: template.id,
      variantId: variant.id,
      snapshot,
    },
  };
  if (sampleIndex >= 0) state.clients[sampleIndex] = client;
  else state.clients = [client, ...state.clients];
  return { state, client, variantId: variant.id };
}
