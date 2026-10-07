import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router";

import { queries, useSignUp } from "../../store/api";
import {
  AuthPage,
  Field,
  FormError,
  SubmitButton,
  formValues,
} from "./AuthForm";

export function SignUp() {
  const user = useSuspenseQuery(queries.me).data;
  const signUp = useSignUp();
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  return (
    <AuthPage title="Create account">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const { name, email, password, inviteCode } = formValues(
            e.currentTarget,
          );
          signUp.mutate(
            { name, email, password, inviteCode },
            { onSuccess: () => navigate("/", { replace: true }) },
          );
        }}
      >
        <Field label="Name" name="name" autoComplete="name" />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Field
          label="Password (8+ characters)"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Field
          label="Invite code"
          name="inviteCode"
          autoComplete="off"
          required
        />
        <FormError error={signUp.error} />
        <SubmitButton pending={signUp.isPending}>Create account</SubmitButton>
      </form>
      <p className="mt-6">
        Already have an account?{" "}
        <Link to="/login" className="text-fuchsia-400 underline">
          Sign in
        </Link>
      </p>
    </AuthPage>
  );
}
