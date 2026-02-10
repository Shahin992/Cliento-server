import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddlewares';
import { updateProfileHandler, updateProfilePhotoHandler } from './user.controller';

const router = Router();

/**
 * @swagger
 * /api/users/profile-photo:
 *   patch:
 *     tags:
 *       - Users
 *     summary: Update profile photo
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - profilePhoto
 *             properties:
 *               profilePhoto:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Profile photo updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.patch('/profile-photo', authenticate, updateProfilePhotoHandler);

/**
 * @swagger
 * /api/users/profile:
 *   patch:
 *     tags:
 *       - Users
 *     summary: Update profile fields
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               companyName:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               location:
 *                 type: string
 *                 nullable: true
 *               timeZone:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.patch('/profile', authenticate, updateProfileHandler);

export default router;
