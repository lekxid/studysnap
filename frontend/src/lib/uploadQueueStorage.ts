const DATABASE_NAME =
  "studysnap-upload-queue";

const DATABASE_VERSION = 1;
const FILE_STORE = "upload-files";

type StoredUploadFile = {
  taskId: string;
  file: Blob;
  name: string;
  type: string;
  lastModified: number;
};

let databasePromise:
  | Promise<IDBDatabase>
  | null = null;

function getDatabase(): Promise<IDBDatabase> {
  if (
    typeof window === "undefined" ||
    !("indexedDB" in window)
  ) {
    return Promise.reject(
      new Error(
        "Browser upload recovery is unavailable."
      )
    );
  }

  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise(
    (resolve, reject) => {
      const request =
        window.indexedDB.open(
          DATABASE_NAME,
          DATABASE_VERSION
        );

      request.onupgradeneeded = () => {
        const database =
          request.result;

        if (
          !database.objectStoreNames.contains(
            FILE_STORE
          )
        ) {
          database.createObjectStore(
            FILE_STORE,
            {
              keyPath: "taskId",
            }
          );
        }
      };

      request.onsuccess = () => {
        const database =
          request.result;

        database.onversionchange =
          () => {
            database.close();
            databasePromise = null;
          };

        resolve(database);
      };

      request.onerror = () => {
        databasePromise = null;

        reject(
          request.error ??
            new Error(
              "Upload recovery storage could not be opened."
            )
        );
      };

      request.onblocked = () => {
        databasePromise = null;

        reject(
          new Error(
            "Upload recovery storage is blocked by another StudySnap tab."
          )
        );
      };
    }
  );

  return databasePromise;
}

function waitForTransaction(
  transaction: IDBTransaction
): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      transaction.oncomplete =
        () => resolve();

      transaction.onerror = () =>
        reject(
          transaction.error ??
            new Error(
              "Upload recovery storage failed."
            )
        );

      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error(
              "Upload recovery storage was interrupted."
            )
        );
    }
  );
}

export async function saveUploadQueueFiles(
  entries: {
    taskId: string;
    file: File;
  }[]
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const database =
    await getDatabase();

  const transaction =
    database.transaction(
      FILE_STORE,
      "readwrite"
    );

  const store =
    transaction.objectStore(
      FILE_STORE
    );

  entries.forEach(
    ({ taskId, file }) => {
      const record: StoredUploadFile =
        {
          taskId,
          file,
          name: file.name,
          type:
            file.type ||
            "application/octet-stream",
          lastModified:
            file.lastModified ||
            Date.now(),
        };

      store.put(record);
    }
  );

  await waitForTransaction(
    transaction
  );
}

export async function readUploadQueueFile(
  taskId: string
): Promise<File | null> {
  const database =
    await getDatabase();

  return new Promise(
    (resolve, reject) => {
      const transaction =
        database.transaction(
          FILE_STORE,
          "readonly"
        );

      const request =
        transaction
          .objectStore(FILE_STORE)
          .get(taskId);

      request.onsuccess = () => {
        const record =
          request.result as
            | StoredUploadFile
            | undefined;

        if (!record) {
          resolve(null);
          return;
        }

        resolve(
          new File(
            [record.file],
            record.name,
            {
              type:
                record.type ||
                record.file.type,
              lastModified:
                record.lastModified,
            }
          )
        );
      };

      request.onerror = () => {
        reject(
          request.error ??
            new Error(
              "The queued file could not be restored."
            )
        );
      };
    }
  );
}

export async function deleteUploadQueueFiles(
  taskIds: string[]
): Promise<void> {
  if (taskIds.length === 0) {
    return;
  }

  const database =
    await getDatabase();

  const transaction =
    database.transaction(
      FILE_STORE,
      "readwrite"
    );

  const store =
    transaction.objectStore(
      FILE_STORE
    );

  taskIds.forEach((taskId) => {
    store.delete(taskId);
  });

  await waitForTransaction(
    transaction
  );
}
