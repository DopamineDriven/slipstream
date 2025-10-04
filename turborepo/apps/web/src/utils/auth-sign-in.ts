import { authClient } from "@/utils/auth-client";

export const signinGithub = async () => {
  const data = await authClient.signIn.social({
    provider: "github"
  });
  return data;
};

export const signinGoogle = async () => {
  const data = await authClient.signIn.social({
    provider: "google"
  });
  return data;
};

export const signinAnonymous = async () => {
  const data = await authClient.signIn.anonymous();
  return data;
};
