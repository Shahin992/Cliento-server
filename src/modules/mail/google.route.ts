import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddlewares';
import {
  deleteGoogleMailboxHandler,
  disconnectGoogleMailboxHandler,
  getGoogleAuthUrlHandler,
  getGoogleMailboxListHandler,
  googleOAuthCallbackHandler,
  listGoogleInboxHandler,
  makeDefaultGoogleMailboxHandler,
  sendGoogleEmailHandler,
} from './google.controller';

const router = Router();

/**
 * @swagger
 * /api/mail/google/connect:
 *   get:
 *     tags:
 *       - Mail
 *     summary: Generate Google OAuth consent URL
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OAuth URL generated
 *       401:
 *         description: Unauthorized
 */
router.get('/connect', authenticate, getGoogleAuthUrlHandler);

/**
 * @swagger
 * /api/mail/google/callback:
 *   get:
 *     tags:
 *       - Mail
 *     summary: Google OAuth callback endpoint (redirects to frontend UI)
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirect to frontend callback URL
 *       400:
 *         description: Invalid callback payload
 */
router.get('/callback', googleOAuthCallbackHandler);

/**
 * @swagger
 * /api/mail/google/accounts:
 *   get:
 *     tags:
 *       - Mail
 *     summary: List all Gmail accounts for user and always include authUrl
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mailbox list fetched
 *       401:
 *         description: Unauthorized
 */
router.get('/accounts', authenticate, getGoogleMailboxListHandler);

/**
 * @swagger
 * /api/mail/google/send:
 *   post:
 *     tags:
 *       - Mail
 *     summary: Send email using connected Gmail account
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *             properties:
 *               to:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *               cc:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *               bcc:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *               subject:
 *                 type: string
 *               text:
 *                 type: string
 *               html:
 *                 type: string
 *               threadId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email sent
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Mailbox not connected
 */
router.post('/send', authenticate, sendGoogleEmailHandler);

/**
 * @swagger
 * /api/mail/google/inbox:
 *   get:
 *     tags:
 *       - Mail
 *     summary: List inbox messages from connected Gmail account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: maxResults
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *       - in: query
 *         name: pageToken
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Inbox fetched
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Mailbox not connected
 */
router.get('/inbox', authenticate, listGoogleInboxHandler);

/**
 * @swagger
 * /api/mail/google/disconnect/{mailboxId}:
 *   post:
 *     tags:
 *       - Mail
 *     summary: Disconnect linked Gmail mailbox (sets isDisconnected=true)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mailboxId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Mailbox disconnected
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Mailbox not connected
 */
router.post('/disconnect/:mailboxId', authenticate, disconnectGoogleMailboxHandler);

/**
 * @swagger
 * /api/mail/google/delete/{mailboxId}:
 *   post:
 *     tags:
 *       - Mail
 *     summary: Delete linked Gmail mailbox (sets isDisconnected=true and isDeleted=true)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mailboxId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Mailbox deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Mailbox not connected
 */
router.post('/delete/:mailboxId', authenticate, deleteGoogleMailboxHandler);

/**
 * @swagger
 * /api/mail/google/make-default/{mailboxId}:
 *   post:
 *     tags:
 *       - Mail
 *     summary: Make a connected Gmail mailbox default
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mailboxId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Default mailbox updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Mailbox not found or not active
 */
router.post('/make-default/:mailboxId', authenticate, makeDefaultGoogleMailboxHandler);

export default router;
