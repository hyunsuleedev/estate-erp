import { ConsumerAuthGuard } from "./consumer-auth.guard";
import { verifyToken } from "@clerk/backend";
jest.mock("@clerk/backend", () => ({ verifyToken: jest.fn() }));
describe("consumer authentication boundary", () => {
  const config: any = {
    get: (key: string) =>
      key === "CLERK_SECRET_KEY" ? "test-secret" : "http://localhost:5180",
  };
  const context = (req: any) =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;
  it("rejects absent bearer token", async () => {
    await expect(
      new ConsumerAuthGuard(config).canActivate(context({ headers: {} })),
    ).rejects.toThrow();
  });
  it("verifies allowed origins and assigns only a consumer identity", async () => {
    (verifyToken as jest.Mock).mockResolvedValue({ sub: "consumer-id" });
    const req: any = { headers: { authorization: "Bearer token" } };
    await new ConsumerAuthGuard(config).canActivate(context(req));
    expect(verifyToken).toHaveBeenCalledWith("token", {
      secretKey: "test-secret",
      authorizedParties: ["http://localhost:5180"],
    });
    expect(req.consumerId).toBe("consumer-id");
    expect(req.user).toBeUndefined();
  });
  it("fails closed without allowed origins", async () => {
    await expect(
      new ConsumerAuthGuard({ get: () => undefined } as any).canActivate(
        context({ headers: { authorization: "Bearer token" } }),
      ),
    ).rejects.toThrow("준비 중");
  });
});
