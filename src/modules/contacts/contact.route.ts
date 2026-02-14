import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddlewares';
import {
  createContactHandler,
  deleteContactHandler,
  getContactByIdHandler,
  listContactNamesHandler,
  listContactsHandler,
  updateContactHandler,
  updateContactPhotoHandler,
} from './contact.controller';

const router = Router();
const CONTACT_ACCESS_ROLES = ['OWNER', 'ADMIN', 'MEMBER'];

/**
 * @swagger
 * /api/contacts:
 *   post:
 *     tags:
 *       - Contacts
 *     summary: Create a contact
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *                 nullable: true
 *               companyName:
 *                 type: string
 *                 nullable: true
 *               photoUrl:
 *                 type: string
 *                 nullable: true
 *               emails:
 *                 type: array
 *                 items:
 *                   type: string
 *               phones:
 *                 type: array
 *                 items:
 *                   type: string
 *               address:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   postalCode:
 *                     type: string
 *                   zipCode:
 *                     type: string
 *                   country:
 *                     type: string
 *     responses:
 *       201:
 *         description: Contact created successfully
 */
router.post('/', authenticate, authorize(CONTACT_ACCESS_ROLES), createContactHandler);

/**
 * @swagger
 * /api/contacts:
 *   get:
 *     tags:
 *       - Contacts
 *     summary: List my contacts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or phone
 *     responses:
 *       200:
 *         description: Contacts fetched successfully
 */
router.get('/', authenticate, authorize(CONTACT_ACCESS_ROLES), listContactsHandler);

/**
 * @swagger
 * /api/contacts/options:
 *   get:
 *     tags:
 *       - Contacts
 *     summary: List contacts for dropdown (id + name)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or phone
 *     responses:
 *       200:
 *         description: Contact options fetched successfully
 */
router.get('/options', authenticate, authorize(CONTACT_ACCESS_ROLES), listContactNamesHandler);

/**
 * @swagger
 * /api/contacts/{id}:
 *   get:
 *     tags:
 *       - Contacts
 *     summary: Get a contact by id
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contact fetched successfully
 *       404:
 *         description: Contact not found
 */
router.get('/:id', authenticate, authorize(CONTACT_ACCESS_ROLES), getContactByIdHandler);

/**
 * @swagger
 * /api/contacts/{id}:
 *   put:
 *     tags:
 *       - Contacts
 *     summary: Update a contact
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Contact updated successfully
 *       404:
 *         description: Contact not found
 */
router.put('/:id', authenticate, authorize(CONTACT_ACCESS_ROLES), updateContactHandler);

/**
 * @swagger
 * /api/contacts/{id}/photo:
 *   put:
 *     tags:
 *       - Contacts
 *     summary: Update contact photo only
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - photoUrl
 *             properties:
 *               photoUrl:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Contact photo updated successfully
 *       404:
 *         description: Contact not found
 */
router.put('/:id/photo', authenticate, authorize(CONTACT_ACCESS_ROLES), updateContactPhotoHandler);

/**
 * @swagger
 * /api/contacts/{id}:
 *   delete:
 *     tags:
 *       - Contacts
 *     summary: Delete a contact
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contact deleted successfully
 *       404:
 *         description: Contact not found
 */
router.delete('/:id', authenticate, authorize(CONTACT_ACCESS_ROLES), deleteContactHandler);

export default router;
