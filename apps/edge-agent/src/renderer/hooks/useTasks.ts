import { useState, useEffect, useCallback } from 'react';
import { memoryClient } from '../../services/api';

export interface Task {
    id: string;
    title: string;
    description?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    priority: 'low' | 'medium' | 'high';
    due_date?: string;
    assignee_id?: string;
    related_event_id?: string;
    source?: 'user' | 'system' | 'chat' | 'email';
    created_at: string;
}

interface UseTasksOptions {
    status?: 'pending' | 'in_progress' | 'completed' | 'all';
    limit?: number;
}

interface UseTasksResult {
    tasks: Task[];
    loading: boolean;
    error: Error | null;
    refetch: () => void;
    updateTaskStatus: (taskId: string, status: Task['status']) => Promise<void>;
}

export function useTasks(options: UseTasksOptions = {}): UseTasksResult {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await memoryClient.getTasks({
                status: options.status !== 'all' ? options.status : undefined,
                limit: options.limit || 50,
            });

            if (response.success && response.data) {
                setTasks(response.data);
            } else {
                setTasks([]);
            }
        } catch (err) {
            console.error('[useTasks] Failed to fetch tasks:', err);
            setError(err instanceof Error ? err : new Error('Failed to fetch tasks'));
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [options.status, options.limit]);

    const updateTaskStatus = useCallback(async (taskId: string, status: Task['status']) => {
        try {
            await memoryClient.updateTaskStatus(taskId, status);
            // Update local state
            setTasks(prev => prev.map(task =>
                task.id === taskId ? { ...task, status } : task
            ));
        } catch (err) {
            console.error('Failed to update task status:', err);
            throw err;
        }
    }, []);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    return { tasks, loading, error, refetch: fetchTasks, updateTaskStatus };
}
