import jwt from 'jsonwebtoken';
import { User } from './user.model';
import { RegisterUserInput } from './user.interface';

type SigninInput = {
  email: string;
  password: string;
};

export const registerUser = async (payload: RegisterUserInput) => {
  const user = new User(payload);
  await user.save();
  return user;
};

export const loginUser = async (payload: SigninInput) => {
  const user = await User.findOne({ email: payload.email });
  if (!user || !(await user.comparePassword(payload.password))) {
    return null;
  }

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_TOKEN_SECRET || 'this_is_cliento_crm_token_secret',
    { expiresIn: '1h' }
  );
  return { user, token };
};
