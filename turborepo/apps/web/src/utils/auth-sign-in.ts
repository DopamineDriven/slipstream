import { signIn } from "@/utils/auth-client";

export const signinGithub = async () => {

  return await signIn.social({
    provider: "github"
  });
};

export const signinGoogle = async () => {

  return await signIn.social({
    provider: "google"
  });
};

export const signinAnonymous = async () => {

  return await signIn.anonymous();
};
