export * from './interfaces';
export interface StructuredData {
    entities: Array<{
        type: string;
        value: string;
        confidence?: number;
    }>;
    summary: string;
    [key: string]: any;
}
//# sourceMappingURL=types.d.ts.map