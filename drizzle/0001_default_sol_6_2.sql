UPDATE households
SET state = json_set(state, '$.model', 'gpt-6.2-sol'),
    version = version + 1
WHERE json_extract(state, '$.model') = 'gpt-6.1-sol';
