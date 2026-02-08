import { z } from 'zod';

const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
  password: z.string().min(6),
  phone: z.string(),
  address: z.string()
});

const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const carSchema = z.object({
  name: z.string(),
  description: z.string(),
  color: z.string(),
  isElectric: z.boolean(),
  features: z.array(z.string()),
  pricePerHour: z.number()
});

const carUpdateSchema = carSchema.partial();

const bookingSchema = z.object({
  carId: z.string(),
  date: z.string(),
  startTime: z.string()
});

 const returnCarSchema = z.object({
  bookingId: z.string().nonempty(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/), // HH:mm format validation
});

export {userSchema,signinSchema,carSchema,carUpdateSchema,bookingSchema,returnCarSchema};