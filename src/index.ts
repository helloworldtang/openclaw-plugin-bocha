/**
 * Plugin entry point. Registers the Bocha web-search provider; HTTP execution
 * stays inside the provider's lazy tool implementation.
 */
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { createBochaWebSearchProvider } from "./bocha-provider.js";

export default definePluginEntry({
  id: "bocha",
  name: "Bocha Plugin",
  description: "Bocha Web Search provider for OpenClaw",
  register(api) {
    api.registerWebSearchProvider(createBochaWebSearchProvider());
  },
});
