import {
  ClerkProvider,
  SignIn,
  SignUp,
  useAuth,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import BudgetApp from "./App";

const publishableKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const proxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

if (!publishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY for sign-in.");
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function LoadingScreen() {
  return (
    <main className="auth-page">
      <section className="auth-card" role="status">
        <div className="eyebrow">Budget clarity</div>
        <h1>Loading your account…</h1>
      </section>
    </main>
  );
}

function LandingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (isSignedIn) return <Redirect to="/app" />;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <img className="auth-logo" src={`${basePath}/logo.svg`} alt="" />
        <div className="eyebrow">Your monthly plan</div>
        <h1>A clear view. A balanced plan.</h1>
        <p>
          Save your category purposes, income plan, and reimbursement matches
          to your private account so they are ready when you return.
        </p>
        <div className="auth-actions">
          <a className="auth-primary" href={`${basePath}/sign-up`}>
            Create an account
          </a>
          <a className="auth-secondary" href={`${basePath}/sign-in`}>
            Sign in
          </a>
        </div>
        <p className="auth-note">
          Your YNAB token and fetched transaction history stay in this browser.
        </p>
      </section>
    </main>
  );
}

function SignInPage() {
  return (
    <main className="auth-page">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={`${basePath}/app`}
      />
    </main>
  );
}

function SignUpPage() {
  return (
    <main className="auth-page">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={`${basePath}/app`}
      />
    </main>
  );
}

function PrivateBudgetApp() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect to="/" />;
  return <BudgetApp userId={userId ?? null} />;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      proxyUrl={proxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your saved budget settings",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Save your budget plan across sessions",
          },
        },
      }}
      appearance={{
        theme: "simple",
        variables: {
          colorPrimary: "#236d59",
          colorForeground: "#203a37",
          colorMutedForeground: "#60716f",
          colorBackground: "#ffffff",
          colorInput: "#ffffff",
          colorInputForeground: "#203a37",
          colorDanger: "#a13c29",
          colorNeutral: "#dde4df",
          fontFamily: "system-ui, sans-serif",
          borderRadius: "14px",
        },
        elements: {
          rootBox: { width: "100%", display: "flex", justifyContent: "center" },
          cardBox: {
            background: "#ffffff",
            border: "1px solid #dde4df",
            borderRadius: "18px",
            boxShadow: "none",
            width: "min(100%, 440px)",
          },
          card: { boxShadow: "none", border: "0", background: "transparent" },
          footer: { boxShadow: "none", border: "0", background: "transparent" },
          headerTitle: { color: "#203a37" },
          headerSubtitle: { color: "#60716f" },
          formFieldLabel: { color: "#203a37" },
          formFieldInput: { borderColor: "#dde4df", color: "#203a37" },
          formButtonPrimary: { background: "#236d59" },
          footerActionLink: { color: "#236d59" },
          footerActionText: { color: "#60716f" },
          socialButtonsBlockButton: {
            backgroundColor: "#ffffff",
            border: "1px solid #dde4df",
          },
          socialButtonsBlockButtonText: { color: "#203a37" },
        },
      }}
    >
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/app" component={PrivateBudgetApp} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={() => <Redirect to="/" />} />
      </Switch>
    </ClerkProvider>
  );
}

export default function AuthApp() {
  return (
    <WouterRouter base={basePath}>
      <ClerkRoutes />
    </WouterRouter>
  );
}
