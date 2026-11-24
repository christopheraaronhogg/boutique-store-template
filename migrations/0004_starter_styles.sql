INSERT OR IGNORE INTO categories (id, parent_id, name, slug, sort, icon, noun_one, noun_many) VALUES (1, NULL, 'Handbags', 'handbags', 1, 'bag', 'purse', 'purses');
INSERT OR IGNORE INTO categories (id, parent_id, name, slug, sort) VALUES (2, 1, 'Totes', 'totes', 1);
INSERT OR IGNORE INTO categories (id, parent_id, name, slug, sort) VALUES (3, 1, 'Crossbody', 'crossbody', 2);
INSERT OR IGNORE INTO categories (id, parent_id, name, slug, sort) VALUES (4, 1, 'Shoulder bags', 'shoulder-bags', 3);
INSERT OR IGNORE INTO categories (id, parent_id, name, slug, sort) VALUES (5, 1, 'Satchels', 'satchels', 4);
INSERT OR IGNORE INTO categories (id, parent_id, name, slug, sort) VALUES (6, 1, 'Clutches', 'clutches', 5);
