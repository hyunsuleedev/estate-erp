import { koKR } from "@clerk/localizations";
import { createContext, useContext, type ReactNode } from "react";
import { ClerkProvider, useAuth, useClerk, UserButton } from "@clerk/react";
import { Button } from "@/components/ui/button";
const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
type Session = {
  ready: boolean;
  signedIn: boolean;
  configured: boolean;
  token: () => Promise<string | null>;
  login: () => void;
};
const AuthContext = createContext<Session>({
  ready: true,
  signedIn: false,
  configured: false,
  token: async () => null,
  login: () => {},
});
function SessionProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const clerk = useClerk();
  return (
    <AuthContext.Provider
      value={{
        ready: isLoaded,
        signedIn: !!isSignedIn,
        configured: true,
        token: getToken,
        login: () => clerk.openSignIn(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function ConsumerAuth({ children }: { children: ReactNode }) {
  return key ? (
    <ClerkProvider publishableKey={key} localization={koKR}>
      <SessionProvider>{children}</SessionProvider>
    </ClerkProvider>
  ) : (
    children
  );
}
export const useConsumerAuth = () => useContext(AuthContext);
export function AccountButton({
  onUnavailable,
}: {
  onUnavailable: () => void;
}) {
  const auth = useConsumerAuth();
  return auth.signedIn ? (
    <UserButton />
  ) : (
    <Button
      variant="outline"
      size="sm"
      disabled={!auth.ready}
      onClick={auth.configured ? auth.login : onUnavailable}
    >
      로그인
    </Button>
  );
}
