import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="app-main">
      <h1 className="app-title">App</h1>
      <p className="app-lede">Sign in to continue.</p>
      <LoginForm />
    </main>
  );
}
