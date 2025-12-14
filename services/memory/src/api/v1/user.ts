import { Router, Request, Response, NextFunction } from 'express';
import { EntityModel } from '../../models/EntityModel';
import { v4 as uuidv4 } from 'uuid';

export function createUserRouter(entityModel: EntityModel): Router {
    const router = Router();

    // Get User Preferences
    router.get('/preferences', async (req: Request, res: Response) => {
        try {
            const userEntity = (await entityModel.search('User', { type: 'user', pageSize: 1 })).data[0];

            if (!userEntity) {
                return res.json({
                    success: true,
                    data: {
                        preferences: {},
                        exists: false
                    }
                });
            }

            res.json({
                success: true,
                data: {
                    preferences: {
                        briefingFormat: userEntity.metadata?.briefingFormat,
                        primaryFocus: userEntity.metadata?.strategicFocus,
                        lastCalibrated: userEntity.metadata?.lastCalibrated
                    },
                    userId: userEntity.id
                }
            });
        } catch (error) {
            console.error('Error fetching user preferences:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'FETCH_PREFS_FAILED',
                    message: 'Failed to fetch user preferences'
                }
            });
        }
    });

    // Save User Preferences
    router.get('/preferences', async (req: Request, res: Response) => {
        try {
            const userEntity = (await entityModel.search('User', { type: 'user', pageSize: 1 })).data[0];

            if (!userEntity) {
                return res.json({
                    success: true,
                    data: {
                        preferences: {},
                        exists: false
                    }
                });
            }

            res.json({
                success: true,
                data: {
                    preferences: {
                        briefingFormat: userEntity.metadata?.briefingFormat,
                        primaryFocus: userEntity.metadata?.strategicFocus,
                        lastCalibrated: userEntity.metadata?.lastCalibrated
                    },
                    userId: userEntity.id
                }
            });
        } catch (error) {
            console.error('Error fetching user preferences:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'FETCH_PREFS_FAILED',
                    message: 'Failed to fetch user preferences'
                }
            });
        }
    });

    // Save User Preferences
    router.post('/preferences', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { briefingFormat, primaryFocus } = req.body;

            console.log('[User API] Receiving preferences:', { briefingFormat, primaryFocus });

            // We treat the "User" as a singleton Entity of type 'user'
            // We look for an existing user entity or create one
            // In a multi-user system, we'd need a userId, but for local-first single user:
            let userEntity = (await entityModel.search('User', { type: 'user', pageSize: 1 })).data[0];

            if (!userEntity) {
                userEntity = await entityModel.create({
                    name: 'User',
                    type: 'user',
                    description: 'The primary user of the system',
                    metadata: {}
                });
            }

            // Update the user entity metadata with preferences
            const updatedMetadata = {
                ...(userEntity.metadata || {}),
                briefingFormat,
                strategicFocus: primaryFocus,
                lastCalibrated: new Date().toISOString()
            };

            await entityModel.update(userEntity.id!, {
                metadata: updatedMetadata
            });

            // KEY STEP: Create a semantic Fact for the Strategic Focus so ContextInjector can find it
            // The EntityModel handles embedding generation, so we create a distinct entity for the focus
            // if it's substantial, or we rely on the User entity's text description.
            // Better approach: Create a separate "Fact" or "Goal" entity linked to the User.

            if (primaryFocus) {
                // Create/Update a "Strategic Focus" entity
                const focusEntityName = 'Current Strategic Focus';
                let focusEntity = (await entityModel.search(focusEntityName, { type: 'concept', pageSize: 1 })).data[0];

                if (focusEntity) {
                    await entityModel.update(focusEntity.id!, {
                        description: primaryFocus,
                        metadata: { ...focusEntity.metadata, updatedAt: new Date().toISOString() }
                    });
                } else {
                    focusEntity = await entityModel.create({
                        name: focusEntityName,
                        type: 'concept',
                        description: primaryFocus,
                        metadata: { label: 'Strategic Focus' }
                    });
                }

                // Ensure relationship exists
                const rels = await entityModel.getRelationships(userEntity.id!);
                const hasRel = rels.some(r => r.targetId === focusEntity!.id && r.type === 'related_to');

                if (!hasRel && focusEntity.id) {
                    await entityModel.createRelationship(userEntity.id!, focusEntity.id, 'related_to', { context: 'Has strategic focus' });
                }
            }

            res.json({
                success: true,
                data: {
                    preferences: {
                        briefingFormat,
                        primaryFocus
                    },
                    userId: userEntity.id
                },
                meta: {
                    version: '1.0.0',
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error: unknown) {
            console.error('Error saving user preferences:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'SAVE_PREFS_FAILED',
                    message: 'Failed to save user preferences',
                    details: error instanceof Error ? error.message : String(error)
                }
            });
        }
    });

    return router;
}
