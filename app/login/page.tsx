import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ inviteAccepted?: string | string[] }>;
}) {
  const { inviteAccepted } = await searchParams;
  return (
    <main className="app-main">
      <h1 className="app-title">App</h1>
      {inviteAccepted === "1" ? (
        <p className="auth-success" role="status">
          Your invitation was accepted. Sign in with the invited email and the
          password you just set.
        </p>
      ) : null}
      <p className="app-lede">Sign in to continue.</p>
      <LoginForm />
    </main>
  );
}
