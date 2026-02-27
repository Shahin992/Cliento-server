import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddlewares';
import { createTeamUserHandler, deleteTeamUserHandler, getMyProfileHandler, getTeamUsersHandler, updateProfileHandler, updateProfilePhotoHandler, updateTeamUserHandler } from './user.controller';

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
 * /api/users:
 *   post:
 *     tags:
 *       - Users
 *     summary: Create team user (OWNER/ADMIN)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phoneNumber:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [ADMIN, MEMBER]
 *     responses:
 *       201:
 *         description: Team user created successfully
 *       400:
 *         description: Validation error or team user limit reached
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/', authenticate, authorize(['OWNER', 'ADMIN']), createTeamUserHandler);

/**
 * @swagger
 * /api/users/{userId}:
 *   put:
 *     tags:
 *       - Users
 *     summary: Update team user (OWNER/ADMIN)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [ADMIN, MEMBER]
 *     responses:
 *       200:
 *         description: Team user updated successfully
 *       400:
 *         description: Validation error or invalid operation
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.put('/:userId', authenticate, authorize(['OWNER', 'ADMIN']), updateTeamUserHandler);

/**
 * @swagger
 * /api/users/{userId}:
 *   delete:
 *     tags:
 *       - Users
 *     summary: Delete team user (OWNER/ADMIN)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team user deleted successfully
 *       400:
 *         description: Invalid operation
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.delete('/:userId', authenticate, authorize(['OWNER', 'ADMIN']), deleteTeamUserHandler);

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
