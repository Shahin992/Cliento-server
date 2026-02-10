"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddlewares_1 = require("../../middleware/authMiddlewares");
const user_controller_1 = require("./user.controller");
const router = (0, express_1.Router)();
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
router.patch('/profile-photo', authMiddlewares_1.authenticate, user_controller_1.updateProfilePhotoHandler);
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
router.patch('/profile', authMiddlewares_1.authenticate, user_controller_1.updateProfileHandler);
exports.default = router;
