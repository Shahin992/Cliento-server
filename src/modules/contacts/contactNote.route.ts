import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddlewares';
import {
  createContactNoteHandler,
  deleteContactNoteHandler,
  getContactNoteByIdHandler,
  listContactNotesHandler,
  updateContactNoteHandler,
} from './contactNote.controller';

const router = Router();
const CONTACT_NOTE_ACCESS_ROLES = ['OWNER', 'ADMIN', 'MEMBER'];

/**
 * @swagger
 * /api/contact-notes:
 *   post:
 *     tags:
 *       - Contacts
 *     summary: Create a contact note
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contactId
 *               - body
 *             properties:
 *               contactId:
 *                 type: string
 *                 description: Contact ObjectId
 *               body:
 *                 type: string
 *                 description: Note content
 *                 maxLength: 5000
 *     responses:
 *       201:
 *         description: Contact note created successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contact not found
 */
router.post('/', authenticate, authorize(CONTACT_NOTE_ACCESS_ROLES), createContactNoteHandler);

/**
 * @swagger
 * /api/contact-notes:
 *   get:
 *     tags:
 *       - Contacts
 *     summary: List contact notes by contactId
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authenticate, authorize(CONTACT_NOTE_ACCESS_ROLES), listContactNotesHandler);

/**
 * @swagger
 * /api/contact-notes/{id}:
 *   get:
 *     tags:
 *       - Contacts
 *     summary: Get contact note by id
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', authenticate, authorize(CONTACT_NOTE_ACCESS_ROLES), getContactNoteByIdHandler);

/**
 * @swagger
 * /api/contact-notes/{id}:
 *   put:
 *     tags:
 *       - Contacts
 *     summary: Update contact note
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contact note ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - body
 *             properties:
 *               body:
 *                 type: string
 *                 description: Updated note content
 *                 maxLength: 5000
 *     responses:
 *       200:
 *         description: Contact note updated successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contact note not found
 */
router.put('/:id', authenticate, authorize(CONTACT_NOTE_ACCESS_ROLES), updateContactNoteHandler);

/**
 * @swagger
 * /api/contact-notes/{id}:
 *   delete:
 *     tags:
 *       - Contacts
 *     summary: Delete contact note
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', authenticate, authorize(CONTACT_NOTE_ACCESS_ROLES), deleteContactNoteHandler);

export default router;
