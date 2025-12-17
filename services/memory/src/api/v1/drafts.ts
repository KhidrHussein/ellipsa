import { Router, Request, Response } from 'express';
import { DraftModel } from '../../models/DraftModel';

export function createDraftsRouter(draftModel: DraftModel): Router {
    const router = Router();

    // GET /drafts - List drafts
    router.get('/', async (req: Request, res: Response) => {
        try {
            const { status, limit, page } = req.query;
            const filters: any = {};
            if (status) filters.status = status;

            const result = await draftModel.findAll(filters, {
                page: page ? Number(page) : 1,
                pageSize: limit ? Number(limit) : 20,
                sortBy: 'created_at',
                sortOrder: 'desc'
            });

            res.json(result);
        } catch (error) {
            console.error('Error listing drafts:', error);
            res.status(500).json({ error: 'Failed to list drafts' });
        }
    });

    // POST /drafts - Create draft
    router.post('/', async (req: Request, res: Response) => {
        try {
            const draft = await draftModel.create(req.body);
            res.json(draft);
        } catch (error) {
            console.error('Error creating draft:', error);
            res.status(500).json({ error: 'Failed to create draft' });
        }
    });

    // GET /drafts/:id - Get specific draft
    router.get('/:id', async (req: Request, res: Response) => {
        try {
            const draft = await draftModel.findById(req.params.id);
            if (!draft) return res.status(404).json({ error: 'Draft not found' });
            res.json(draft);
        } catch (error) {
            console.error('Error fetching draft:', error);
            res.status(500).json({ error: 'Failed to fetch draft' });
        }
    });

    // PUT /drafts/:id - Update draft
    router.put('/:id', async (req: Request, res: Response) => {
        try {
            const draft = await draftModel.update(req.params.id, req.body);
            if (!draft) return res.status(404).json({ error: 'Draft not found' });
            res.json(draft);
        } catch (error) {
            console.error('Error updating draft:', error);
            res.status(500).json({ error: 'Failed to update draft' });
        }
    });

    // DELETE /drafts/:id - Delete draft
    router.delete('/:id', async (req: Request, res: Response) => {
        try {
            const success = await draftModel.delete(req.params.id);
            if (!success) return res.status(404).json({ error: 'Draft not found' });
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting draft:', error);
            res.status(500).json({ error: 'Failed to delete draft' });
        }
    });

    return router;
}
