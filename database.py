# database.py

import sqlite3

class Database:
    def __init__(self, db_path='database.db'):
        self.db_path = db_path
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.init_db()

    def init_db(self):
        cursor = self.conn.cursor()
        # Создание таблицы треков с полем original_url
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                url TEXT NOT NULL,
                original_url TEXT
            )
        ''')
        # Создание таблицы тегов
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            )
        ''')
        # Создание связующей таблицы track_tags
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS track_tags (
                track_id INTEGER,
                tag_id INTEGER,
                FOREIGN KEY(track_id) REFERENCES tracks(id),
                FOREIGN KEY(tag_id) REFERENCES tags(id),
                PRIMARY KEY(track_id, tag_id)
            )
        ''')
        self.conn.commit()

    # Обновленный метод добавления трека
    def add_track(self, name, description, url, original_url, tags):
        cursor = self.conn.cursor()
        cursor.execute('INSERT INTO tracks (name, description, url, original_url) VALUES (?, ?, ?, ?)',
                       (name, description, url, original_url))
        track_id = cursor.lastrowid
        for tag_name in tags:
            # Проверяем, существует ли тег
            cursor.execute('SELECT id FROM tags WHERE name = ?', (tag_name,))
            tag_row = cursor.fetchone()
            if tag_row:
                tag_id = tag_row[0]
            else:
                cursor.execute('INSERT INTO tags (name) VALUES (?)', (tag_name,))
                tag_id = cursor.lastrowid
            # Добавляем связь трека и тега
            cursor.execute('INSERT OR IGNORE INTO track_tags (track_id, tag_id) VALUES (?, ?)', (track_id, tag_id))
        self.conn.commit()
        return track_id

    # Метод для обновления URL трека
    def update_track_url(self, track_id, url):
        cursor = self.conn.cursor()
        cursor.execute('UPDATE tracks SET url = ? WHERE id = ?', (url, track_id))
        self.conn.commit()

    # Метод для получения трека по ID
    def get_track_by_id(self, track_id):
        cursor = self.conn.cursor()
        cursor.execute('SELECT * FROM tracks WHERE id = ?', (track_id,))
        row = cursor.fetchone()
        if row:
            track = {
                'id': row[0],
                'name': row[1],
                'description': row[2],
                'url': row[3],
                'original_url': row[4],
                'tags': self.get_tags_for_track(row[0])
            }
            return track
        return None

    # Метод для получения всех треков с пагинацией
    def get_tracks(self, page=1, per_page=10):
        cursor = self.conn.cursor()
        offset = (page - 1) * per_page
        cursor.execute('SELECT * FROM tracks LIMIT ? OFFSET ?', (per_page, offset))
        tracks_rows = cursor.fetchall()
        tracks = []
        for row in tracks_rows:
            track = {
                'id': row[0],
                'name': row[1],
                'description': row[2],
                'url': row[3],
                'original_url': row[4],
                'tags': self.get_tags_for_track(row[0])
            }
            tracks.append(track)
        # Получаем общее количество треков
        cursor.execute('SELECT COUNT(*) FROM tracks')
        total = cursor.fetchone()[0]
        return tracks, total

    # Метод для поиска треков по описанию и тегам
    def search_tracks(self, description='', tags=[]):
        cursor = self.conn.cursor()
        query = 'SELECT DISTINCT t.id, t.name, t.description, t.url, t.original_url FROM tracks t'
        params = []
        if tags:
            query += ' INNER JOIN track_tags tt ON t.id = tt.track_id INNER JOIN tags g ON tt.tag_id = g.id'
        query += ' WHERE 1=1'
        if description:
            query += ' AND t.description LIKE ?'
            params.append(f'%{description}%')
        if tags:
            query += ' AND g.name IN ({seq})'.format(seq=','.join(['?']*len(tags)))
            params.extend(tags)
        cursor.execute(query, params)
        tracks_rows = cursor.fetchall()
        tracks = []
        for row in tracks_rows:
            track = {
                'id': row[0],
                'name': row[1],
                'description': row[2],
                'url': row[3],
                'original_url': row[4],
                'tags': self.get_tags_for_track(row[0])
            }
            tracks.append(track)
        return tracks

    # Метод для получения тегов трека
    def get_tags_for_track(self, track_id):
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT g.name FROM tags g
            INNER JOIN track_tags tt ON g.id = tt.tag_id
            WHERE tt.track_id = ?
        ''', (track_id,))
        tags = [row[0] for row in cursor.fetchall()]
        return tags

    # Метод для удаления трека
    def delete_track(self, track_id):
        cursor = self.conn.cursor()
        # Удаляем связи из track_tags
        cursor.execute('DELETE FROM track_tags WHERE track_id = ?', (track_id,))
        # Удаляем сам трек
        cursor.execute('DELETE FROM tracks WHERE id = ?', (track_id,))
        self.conn.commit()

    def search_tracks_paginated(self, name='', page=1, per_page=10):
        cursor = self.conn.cursor()

        # Base query
        query = '''
            SELECT DISTINCT t.id, t.name, t.url, t.original_url
            FROM tracks t
        '''
        params = []


        # Where conditions
        query += ' WHERE 1=1'
        if name:
            query += ' AND t.name LIKE ?'
            params.append(f'%{name}%')

        # Pagination
        query += ' LIMIT ? OFFSET ?'
        params.extend([per_page, (page - 1) * per_page])

        # Execute search query
        cursor.execute(query, params)
        tracks_rows = cursor.fetchall()
        tracks = []
        for row in tracks_rows:
            track = {
                'id': row[0],
                'name': row[1],
                'url': row[2],
                'original_url': row[3],
                'tags': self.get_tags_for_track(row[0])
            }
            tracks.append(track)

        # Count total matching records for pagination
        count_query = 'SELECT COUNT(DISTINCT t.id) FROM tracks t'
        count_params = []

        count_query += ' WHERE 1=1'
        if name:
            count_query += ' AND t.name LIKE ?'
            count_params.append(f'%{name}%')

        cursor.execute(count_query, count_params)
        total = cursor.fetchone()[0]

        return tracks, total

    def add_tags_to_track(self, track_id, tags):
        cursor = self.conn.cursor()
        for tag_name in tags:
            cursor.execute('SELECT id FROM tags WHERE name = ?', (tag_name,))
            tag_row = cursor.fetchone()
            if tag_row:
                tag_id = tag_row[0]
            else:
                cursor.execute('INSERT INTO tags (name) VALUES (?)', (tag_name,))
                tag_id = cursor.lastrowid
            cursor.execute('INSERT OR IGNORE INTO track_tags (track_id, tag_id) VALUES (?, ?)', (track_id, tag_id))
        self.conn.commit()

    def reconnect(self):
        self.conn.close()
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.cursor = self.conn.cursor() #  Важно: обновить cursor