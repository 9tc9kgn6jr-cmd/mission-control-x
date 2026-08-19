const pendingServiceRequests = new Map();

const SNAPSHOT_DB_NAME = "mission-control-x";
const SNAPSHOT_DB_VERSION = 1;
const SNAPSHOT_STORE = "reefSnapshots";
const MAX_SNAPSHOTS = 30;


/* ---------------------------------------------------------
   QUICK ACTION STATUS
--------------------------------------------------------- */

const setQuickActionStatus = (message, state = "") => {

  const el = document.getElementById(
    "quick-action-status"
  );

  if (!el) return;

  el.classList.remove(
    "success",
    "error"
  );

  if (state) {
    el.classList.add(state);
  }

  el.textContent = message;
};


/* ---------------------------------------------------------
   HOME ASSISTANT SERVICE CALLS
--------------------------------------------------------- */

const callHomeAssistantService = (
  domain,
  service,
  entityId
) => {

  const requestId =
    `mcx-v2-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  return new Promise(
    (resolve, reject) => {

      pendingServiceRequests.set(
        requestId,
        {
          resolve,
          reject
        }
      );


      window.parent.postMessage(
        {
          type: "reef-call-service",
          requestId,
          domain,
          service,
          serviceData: {},
          target: {
            entity_id: entityId
          }
        },
        window.location.origin
      );


      window.setTimeout(
        () => {

          if (
            !pendingServiceRequests.has(
              requestId
            )
          ) {
            return;
          }

          pendingServiceRequests.delete(
            requestId
          );

          reject(
            new Error(
              "The command timed out."
            )
          );

        },
        12000
      );

    }
  );
};


window.handleMissionControlServiceResult = (
  message
) => {

  const pending =
    pendingServiceRequests.get(
      message.requestId
    );

  if (!pending) return;

  pendingServiceRequests.delete(
    message.requestId
  );

  if (message.success) {

    pending.resolve();

  } else {

    pending.reject(
      new Error(
        message.error ||
        "Command failed."
      )
    );

  }
};


/* ---------------------------------------------------------
   LOCAL TIMELINE
--------------------------------------------------------- */

const logLocalTimelineEvent = (
  message
) => {

  const key =
    "mcx-v2-timeline";

  let events = [];

  try {

    events = JSON.parse(
      localStorage.getItem(key) ||
      "[]"
    );

    if (!Array.isArray(events)) {
      events = [];
    }

  } catch (error) {

    events = [];

  }


  events.unshift(
    {
      message,
      type: "Maintenance",
      timestamp:
        new Date().toISOString()
    }
  );


  localStorage.setItem(
    key,
    JSON.stringify(
      events.slice(0, 100)
    )
  );

};


/* ---------------------------------------------------------
   INDEXED DB
--------------------------------------------------------- */

const openSnapshotDatabase = () => {

  return new Promise(
    (resolve, reject) => {

      const request =
        indexedDB.open(
          SNAPSHOT_DB_NAME,
          SNAPSHOT_DB_VERSION
        );


      request.onupgradeneeded = () => {

        const db =
          request.result;

        if (
          !db.objectStoreNames.contains(
            SNAPSHOT_STORE
          )
        ) {

          const store =
            db.createObjectStore(
              SNAPSHOT_STORE,
              {
                keyPath: "id",
                autoIncrement: true
              }
            );

          store.createIndex(
            "capturedAt",
            "capturedAt",
            {
              unique: false
            }
          );

        }

      };


      request.onsuccess = () => {
        resolve(
          request.result
        );
      };


      request.onerror = () => {
        reject(
          request.error ||
          new Error(
            "Unable to open snapshot database."
          )
        );
      };

    }
  );

};


/* ---------------------------------------------------------
   IMAGE PROCESSING
--------------------------------------------------------- */

const fileToImage = (
  file
) => {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();


      reader.onload = () => {

        const image =
          new Image();


        image.onload = () => {
          resolve(image);
        };


        image.onerror = () => {
          reject(
            new Error(
              "Unable to read the reef photo."
            )
          );
        };


        image.src =
          reader.result;

      };


      reader.onerror = () => {

        reject(
          new Error(
            "Unable to load the selected photo."
          )
        );

      };


      reader.readAsDataURL(file);

    }
  );

};


const resizeReefPhoto = async (
  file
) => {

  const image =
    await fileToImage(file);

  const maxDimension = 1800;

  let width =
    image.naturalWidth;

  let height =
    image.naturalHeight;


  if (
    width > maxDimension ||
    height > maxDimension
  ) {

    const scale =
      Math.min(
        maxDimension / width,
        maxDimension / height
      );

    width =
      Math.round(
        width * scale
      );

    height =
      Math.round(
        height * scale
      );

  }


  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    width;

  canvas.height =
    height;


  const context =
    canvas.getContext(
      "2d"
    );


  context.drawImage(
    image,
    0,
    0,
    width,
    height
  );


  return new Promise(
    (resolve, reject) => {

      canvas.toBlob(
        blob => {

          if (!blob) {

            reject(
              new Error(
                "Unable to prepare reef snapshot."
              )
            );

            return;

          }

          resolve(blob);

        },
        "image/jpeg",
        0.88
      );

    }
  );

};


/* ---------------------------------------------------------
   SAVE SNAPSHOT
--------------------------------------------------------- */

const saveReefSnapshot = async (
  file
) => {

  const blob =
    await resizeReefPhoto(file);

  const db =
    await openSnapshotDatabase();


  const capturedAt =
    new Date().toISOString();


  await new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          SNAPSHOT_STORE,
          "readwrite"
        );


      const store =
        transaction.objectStore(
          SNAPSHOT_STORE
        );


      store.add(
        {
          capturedAt,
          blob
        }
      );


      transaction.oncomplete =
        resolve;


      transaction.onerror =
        () => {

          reject(
            transaction.error ||
            new Error(
              "Unable to save reef snapshot."
            )
          );

        };

    }
  );


  await trimOldSnapshots(db);

  db.close();

  logLocalTimelineEvent(
    "Reef snapshot captured"
  );


  return capturedAt;

};


/* ---------------------------------------------------------
   KEEP LAST 30
--------------------------------------------------------- */

const trimOldSnapshots = async (
  db
) => {

  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          SNAPSHOT_STORE,
          "readwrite"
        );


      const store =
        transaction.objectStore(
          SNAPSHOT_STORE
        );


      const request =
        store.getAll();


      request.onsuccess = () => {

        const snapshots =
          (request.result || [])
            .sort(
              (a, b) =>
                new Date(
                  b.capturedAt
                ) -
                new Date(
                  a.capturedAt
                )
            );


        snapshots
          .slice(
            MAX_SNAPSHOTS
          )
          .forEach(
            snapshot => {

              store.delete(
                snapshot.id
              );

            }
          );

      };


      transaction.oncomplete =
        resolve;


      transaction.onerror =
        () => {

          reject(
            transaction.error ||
            new Error(
              "Unable to maintain snapshot history."
            )
          );

        };

    }
  );

};


/* ---------------------------------------------------------
   GET LATEST SNAPSHOT
--------------------------------------------------------- */

const getLatestReefSnapshot =
  async () => {

    const db =
      await openSnapshotDatabase();


    const result =
      await new Promise(
        (resolve, reject) => {

          const transaction =
            db.transaction(
              SNAPSHOT_STORE,
              "readonly"
            );


          const store =
            transaction.objectStore(
              SNAPSHOT_STORE
            );


          const request =
            store.getAll();


          request.onsuccess =
            () => {

              const snapshots =
                request.result || [];


              snapshots.sort(
                (a, b) =>
                  new Date(
                    b.capturedAt
                  ) -
                  new Date(
                    a.capturedAt
                  )
              );


              resolve(
                snapshots[0] ||
                null
              );

            };


          request.onerror =
            () => {

              reject(
                request.error ||
                new Error(
                  "Unable to load reef snapshot."
                )
              );

            };

        }
      );


    db.close();

    return result;

  };


/* ---------------------------------------------------------
   DELETE LATEST SNAPSHOT
--------------------------------------------------------- */

const deleteLatestReefSnapshot =
  async () => {

    const latest =
      await getLatestReefSnapshot();

    if (!latest) {
      return false;
    }


    const db =
      await openSnapshotDatabase();


    await new Promise(
      (resolve, reject) => {

        const transaction =
          db.transaction(
            SNAPSHOT_STORE,
            "readwrite"
          );


        const store =
          transaction.objectStore(
            SNAPSHOT_STORE
          );


        store.delete(
          latest.id
        );


        transaction.oncomplete =
          resolve;


        transaction.onerror =
          () => {

            reject(
              transaction.error ||
              new Error(
                "Unable to delete reef snapshot."
              )
            );

          };

      }
    );


    db.close();

    return true;

  };


/* ---------------------------------------------------------
   DISPLAY SNAPSHOT
--------------------------------------------------------- */

let currentSnapshotUrl = null;


const renderLatestReefSnapshot =
  async () => {

    const image =
      document.getElementById(
        "reef-snapshot-image"
      );

    const empty =
      document.getElementById(
        "reef-snapshot-empty"
      );

    const time =
      document.getElementById(
        "reef-snapshot-time"
      );


    if (
      !image ||
      !empty ||
      !time
    ) {
      return;
    }


    const latest =
      await getLatestReefSnapshot();


    if (
      currentSnapshotUrl
    ) {

      URL.revokeObjectURL(
        currentSnapshotUrl
      );

      currentSnapshotUrl =
        null;

    }


    if (!latest) {

      image.style.display =
        "none";

      image.removeAttribute(
        "src"
      );

      empty.style.display =
        "block";

      time.textContent =
        "";

      return;

    }


    currentSnapshotUrl =
      URL.createObjectURL(
        latest.blob
      );


    image.src =
      currentSnapshotUrl;

    image.style.display =
      "block";

    empty.style.display =
      "none";


    time.textContent =
      `Captured ${
        new Date(
          latest.capturedAt
        ).toLocaleString()
      }`;

  };


/* ---------------------------------------------------------
   PHONE CAMERA
--------------------------------------------------------- */

const attachSnapshotCapture = () => {

  const button =
    document.getElementById(
      "reef-snapshot-button"
    );

  const input =
    document.getElementById(
      "reef-photo-input"
    );

  const deleteButton =
    document.getElementById(
      "reef-snapshot-delete"
    );


  if (
    button &&
    input
  ) {

    button.addEventListener(
      "click",
      () => {

        input.value = "";

        input.click();

      }
    );


    input.addEventListener(
      "change",
      async () => {

        const file =
          input.files?.[0];

        if (!file) {
          return;
        }


        button.disabled =
          true;


        setQuickActionStatus(
          "Saving reef snapshot..."
        );


        try {

          await saveReefSnapshot(
            file
          );


          await renderLatestReefSnapshot();


          setQuickActionStatus(
            "Reef snapshot saved.",
            "success"
          );


        } catch (error) {

          setQuickActionStatus(
            String(
              error.message ||
              error
            ),
            "error"
          );

        } finally {

          button.disabled =
            false;

        }

      }
    );

  }


  if (deleteButton) {

    deleteButton.addEventListener(
      "click",
      async () => {

        const confirmed =
          window.confirm(
            "Delete the latest reef snapshot?"
          );


        if (!confirmed) {
          return;
        }


        try {

          const deleted =
            await deleteLatestReefSnapshot();


          await renderLatestReefSnapshot();


          setQuickActionStatus(
            deleted
              ? "Latest reef snapshot deleted."
              : "No reef snapshot to delete.",
            deleted
              ? "success"
              : ""
          );


        } catch (error) {

          setQuickActionStatus(
            String(
              error.message ||
              error
            ),
            "error"
          );

        }

      }
    );

  }

};


/* ---------------------------------------------------------
   NORMAL QUICK ACTIONS
--------------------------------------------------------- */

const attachQuickActions = () => {

  document
    .querySelectorAll(
      ".quick-action"
    )
    .forEach(
      button => {

        /*
          Snapshot button has its own
          camera handler.
        */

        if (
          button.dataset.photoCapture
        ) {
          return;
        }


        button.addEventListener(
          "click",
          async () => {

            button.disabled =
              true;


            setQuickActionStatus(
              "Running command..."
            );


            try {

              const timelineEvent =
                button.dataset.timelineEvent;


              if (timelineEvent) {

                logLocalTimelineEvent(
                  timelineEvent
                );


                setQuickActionStatus(
                  `${timelineEvent} logged.`,
                  "success"
                );


              } else {

                const domain =
                  button.dataset.domain;

                const service =
                  button.dataset.service;

                const entity =
                  button.dataset.entity;


                if (
                  !domain ||
                  !service ||
                  !entity
                ) {

                  throw new Error(
                    "This command is not configured correctly."
                  );

                }


                await callHomeAssistantService(
                  domain,
                  service,
                  entity
                );


                setQuickActionStatus(
                  `${
                    button
                      .querySelector(
                        "strong"
                      )
                      ?.textContent ||
                    "Command"
                  } completed.`,
                  "success"
                );

              }


            } catch (error) {

              setQuickActionStatus(
                String(
                  error.message ||
                  error
                ),
                "error"
              );


            } finally {

              window.setTimeout(
                () => {

                  button.disabled =
                    false;

                },
                700
              );

            }

          }
        );

      }
    );


  attachSnapshotCapture();


  renderLatestReefSnapshot()
    .catch(
      error => {

        console.error(
          "Unable to load latest reef snapshot:",
          error
        );

      }
    );

};


window.initQuickActions =
  attachQuickActions;
