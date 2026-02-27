const express = require('express');
const pool = require('../config/db');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Enforce JWT authentication on all scan routes
router.use(authenticateToken);

/**
 * GET /api/scans
 * Retrieves all scans for the authenticated user within their tenant context.
 */
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM scans WHERE partner_id = $1 AND user_id = $2 ORDER BY mod_date DESC', 
            [req.user.partner_id, req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/scans
 * Creates a new scan record.
 */
router.post('/', async (req, res) => {
    const { qr_url, address_text, qr_image_src, address_image_src, notes } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO scans (partner_id, user_id, qr_url, address_text, qr_image_src, address_image_src, notes, mod_user, mod_date) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
            [req.user.partner_id, req.user.id, qr_url, address_text, qr_image_src, address_image_src, notes, req.user.username]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/scans/:id
 * Updates an existing scan record. Supports partial updates via COALESCE.
 */
router.put('/:id', async (req, res) => {
    const { qr_url, address_text, status, notes } = req.body;
    try {
        const result = await pool.query(
            `UPDATE scans 
             SET qr_url = $1, 
                 address_text = $2, 
                 status = COALESCE($3, status), 
                 notes = COALESCE($4, notes), 
                 mod_user = $5, 
                 mod_date = NOW() 
             WHERE id = $6 AND partner_id = $7 AND user_id = $8 RETURNING *`,
            [qr_url, address_text, status, notes, req.user.username, req.params.id, req.user.partner_id, req.user.id]
        );
        
        if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/scans/:id
 * Removes a specific scan record.
 */
router.delete('/:id', async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM scans WHERE id = $1 AND partner_id = $2 AND user_id = $3', 
            [req.params.id, req.user.partner_id, req.user.id]
        );
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;