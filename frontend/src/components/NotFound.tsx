import { Link } from "@tanstack/react-router";

// An address the app doesn't have: an old link, a typo, or a list since
// deleted. nginx answers every address with the app, so the app says so
// itself, and offers the way back.
export function NotFound() {
  return (
    <div className="page-fade-in sign-in">
      <div className="auth-form">
        <h1 className="auth-title">Page not found</h1>
        <p className="auth-lead">This page doesn't exist. The link may be old, or mistyped.</p>
        <Link className="btn btn-primary btn-block auth-button-link" to="/">
          Go to your lists
        </Link>
        <Link className="auth-switch" to="/welcome">
          What is Accucery?
        </Link>
      </div>
    </div>
  );
}
