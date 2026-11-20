import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, isAuthorized, SESSION_COOKIE } from "@/lib/session";

const req = (cookie?: string) => new Request("http://x/api/assets", { method: "POST", headers: cookie ? { cookie } : {} });

describe("isAuthorized (routes hors middleware)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("exige une session valide quand un mot de passe est configuré", async () => {
    vi.stubEnv("APP_PASSWORD", "secret");
    vi.stubEnv("SESSION_SECRET", "s".repeat(40));
    expect(await isAuthorized(req())).toBe(false);
    expect(await isAuthorized(req(`${SESSION_COOKIE}=123.faux`))).toBe(false);
    const token = await createSessionToken();
    expect(await isAuthorized(req(`autre=1; ${SESSION_COOKIE}=${token}`))).toBe(true);
  });

  it("sans mot de passe : ouvert en dev, fermé en production", async () => {
    vi.stubEnv("APP_PASSWORD", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(await isAuthorized(req())).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(await isAuthorized(req())).toBe(false);
  });
});
