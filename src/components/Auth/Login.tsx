import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";

import { queries, useLogin } from "../../store/api";
import {
  AuthPage,
  Field,
  FormError,
  SubmitButton,
  formValues,
  safeNext,
} from "./AuthForm";

export function Login() {
  const user = useSuspenseQuery(queries.me).data;
  const login = useLogin();
  const navigate = useNavigate();
  const next = safeNext(useSearchParams()[0].get("next"));

  if (user) return <Navigate to={next} replace />;

  return (
    <AuthPage title="Sign in">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const { email, password } = formValues(e.currentTarget);
          login.mutate(
            { email, password },
            { onSuccess: () => navigate(next, { replace: true }) },
          );
        }}
      >
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormError error={login.error} />
        <SubmitButton pending={login.isPending}>Sign in</SubmitButton>
      </form>
      <p className="mt-6">
        Have an invite code?{" "}
        <Link to="/signup" className="text-fuchsia-400 underline">
          Create an account
        </Link>
      </p>
    </AuthPage>
  );
}
