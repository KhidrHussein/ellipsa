
import { ChromaClient } from 'chromadb';
import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function debugEntity() {
    console.log('--- Debugging Entity: daqmedia@gmail.com ---');

    // 1. Check ChromaDB
    const chroma = new ChromaClient({ path: "http://localhost:8000" });
    const collection = await chroma.getCollection({ name: "entities", embeddingFunction: { generate: async () => [] } as any }); // Dummy embedding function for query

    const results = await collection.get({
        where: { name: "daqmedia@gmail.com" }
    });

    console.log('\n[ChromaDB] Entity Data:');
    if (results.ids.length > 0) {
        console.log(JSON.stringify(results.metadatas[0], null, 2));
    } else {
        console.log('Not found in ChromaDB');
    }

    // 2. Check Neo4j Relationships
    const driver = neo4j.driver(
        process.env.NEO4J_URI || 'bolt://localhost:7687',
        neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || 'password')
    );
    const session = driver.session();

    try {
        const result = await session.run(`
            MATCH (e:Entity {name: "daqmedia@gmail.com"})-[r]-(related)
            RETURN type(r) as relationship, related.name as related_entity, related.type as related_type
        `);

        console.log('\n[Neo4j] Relationships:');
        if (result.records.length === 0) {
            console.log('No relationships found.');
        } else {
            result.records.forEach(record => {
                console.log(`- [${record.get('relationship')}] -> ${record.get('related_entity')} (${record.get('related_type')})`);
            });
        }

        // Check if John exists
        const johnResult = await session.run(`
            MATCH (e:Entity {name: "John"})
            RETURN e.name, e.type
        `);
        console.log('\n[Neo4j] John Entity:');
        if (johnResult.records.length > 0) {
            console.log('Found John in Graph');

            // REPAIR: Create relationship if missing
            if (result.records.length === 0) {
                console.log('Repairing: Linking daqmedia@gmail.com to John...');
                await session.run(`
                    MATCH (e1:Entity {name: "John"}), (e2:Entity {name: "daqmedia@gmail.com"})
                    MERGE (e1)-[r:RELATED_TO]->(e2)
                    SET r.weight = 1, r.context = "User stated John's email"
                 `);
                console.log('Repair complete.');
            }
        } else {
            console.log('John NOT found in Graph');
        }

    } catch (error) {
        console.error('Neo4j Error:', error);
    } finally {
        await session.close();
        await driver.close();
    }
}

debugEntity();
