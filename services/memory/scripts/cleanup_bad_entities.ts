
import { driver, auth } from 'neo4j-driver';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env from service root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const neo4jUser = process.env.NEO4J_USER || 'neo4j';
const neo4jPassword = process.env.NEO4J_PASSWORD || 'password';

const drv = driver(neo4jUri, auth.basic(neo4jUser, neo4jPassword));

async function cleanup() {
    const session = drv.session();
    try {
        console.log('Cleaning up stale entities...');

        // Delete 'user@example.com'
        const res1 = await session.run(`
            MATCH (n:Entity) 
            WHERE n.name = 'user@example.com' OR n.email = 'user@example.com'
            DETACH DELETE n
            RETURN count(n) as deleted
        `);
        console.log(`Deleted 'user@example.com' count: ${res1.records[0].get('deleted')}`);

        // Delete generic 'Your Email' if it's type 'other'
        const res2 = await session.run(`
            MATCH (n:Entity {type: 'other'}) 
            WHERE n.name = 'Your Email' OR n.name = 'My Email'
            DETACH DELETE n
            RETURN count(n) as deleted
        `);
        console.log(`Deleted generic 'Your Email' count: ${res2.records[0].get('deleted')}`);

    } catch (err) {
        console.error('Error cleaning up:', err);
    } finally {
        await session.close();
        await drv.close();
    }
}

cleanup();
