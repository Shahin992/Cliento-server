import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddlewares';
import { getMyProfileHandler, getTeamUsersHandler, updateProfileHandler, updateProfilePhotoHandler } from './user.controller';

const router = Router();

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get my profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/me', authenticate, getMyProfileHandler);

/**
 * @swagger
 * /api/users/team-users:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get users of my team with package user capacity
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Team users fetched successfully
 *       400:
 *         description: Team id missing for current user
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/team-users', authenticate, getTeamUsersHandler);

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
