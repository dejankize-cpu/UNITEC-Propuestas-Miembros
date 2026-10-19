(() => {
  const firebaseConfig = {
    apiKey: "AIzaSyC5lKS5LfWXlZU-qg69of4J_KmxvmBmzIk",
    authDomain: "propuestasmiembrosunitec.firebaseapp.com",
    databaseURL: "https://propuestasmiembrosunitec-default-rtdb.firebaseio.com",
    projectId: "propuestasmiembrosunitec",
    storageBucket: "propuestasmiembrosunitec.firebasestorage.app",
    messagingSenderId: "535617565937",
    appId: "1:535617565937:web:7a08b2e5db2029157de550"
  };
  const cloudinary = {
    cloudName: "c29k1kto",
    uploadPreset: "DataBaseImgProgetUNITEC"
  };
  const facultySlugs = {
    "Ingeniería Civil": "civil",
    Derecho: "derecho",
    Medicina: "medicina",
    Electromecánicas: "mecatronica"
  };
  const roleInfo = {
    admin: { role: "admin", faculty: null, facultyKey: null },
    "presidente-civil": { role: "presidente", faculty: "Ingeniería Civil", facultyKey: "civil" },
    "vicepresidente-civil": { role: "vicepresidente", faculty: "Ingeniería Civil", facultyKey: "civil" },
    "presidente-derecho": { role: "presidente", faculty: "Derecho", facultyKey: "derecho" },
    "vicepresidente-derecho": { role: "vicepresidente", faculty: "Derecho", facultyKey: "derecho" },
    "presidente-medicina": { role: "presidente", faculty: "Medicina", facultyKey: "medicina" },
    "vicepresidente-medicina": { role: "vicepresidente", faculty: "Medicina", facultyKey: "medicina" },
    "presidente-mecatronica": { role: "presidente", faculty: "Electromecánicas", facultyKey: "mecatronica" },
    "vicepresidente-mecatronica": { role: "vicepresidente", faculty: "Electromecánicas", facultyKey: "mecatronica" }
  };

  if (!window.firebase) throw new Error("No se cargaron los SDK de Firebase.");
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  const auth = firebase.auth();
  const database = firebase.database();
  const cache = { members: [], proposals: [], roleAssignments: {} };
  const authReady = new Promise(resolve => auth.onAuthStateChanged(resolve));
  let activeRole = null;
  const roleCache = {};
  const memberContactsCache = {};

  function rowsFromSnapshot(snapshot) {
    const value = snapshot.val() || {};
    return Object.entries(value).map(([id, record]) => ({ id, ...record }));
  }

  async function uploadImage(file, folder) {
    if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
      throw new Error("Selecciona un archivo de imagen válido.");
    }
    const body = new FormData();
    body.append("file", file);
    body.append("upload_preset", cloudinary.uploadPreset);
    body.append("folder", `unitec/${folder}`);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`, {
      method: "POST",
      body
    });
    const result = await response.json();
    if (!response.ok || !result.secure_url) {
      throw new Error(result.error?.message || "No se pudo subir la imagen.");
    }
    return result.secure_url;
  }

  async function uploadProfilePhoto(file) {
    return uploadImage(file, "miembros");
  }

  async function uploadProposalImage(file) {
    return uploadImage(file, "propuestas");
  }

  async function uploadImageValue(value, folder) {
    if (!value) return "";
    if (value instanceof Blob) return uploadImage(value, folder);
    if (typeof value !== "string" || !value.startsWith("data:image/")) return value;
    const response = await fetch(value);
    return uploadImage(await response.blob(), folder);
  }

  async function uploadImagesInContent(content) {
    const template = document.createElement("template");
    template.innerHTML = String(content || "");
    for (const image of template.content.querySelectorAll("img")) {
      const source = image.getAttribute("src") || "";
      if (source.startsWith("data:image/")) image.setAttribute("src", await uploadImageValue(source, "propuestas"));
    }
    return template.innerHTML;
  }

  async function getMemberContacts(facultyKey = activeRole?.facultyKey) {
    if (activeRole?.role === "admin") {
      const snapshot = await database.ref("memberContacts").once("value");
      return Object.values(snapshot.val() || {}).reduce((all, facultyContacts) => ({ ...all, ...(facultyContacts || {}) }), {});
    }
    if (!facultyKey || activeRole?.facultyKey !== facultyKey) return {};
    const snapshot = await database.ref(`memberContacts/${facultyKey}`).once("value");
    return snapshot.val() || {};
  }

  async function listMembers(faculty = null) {
    await authReady;
    const [membersSnapshot, contacts] = await Promise.all([
      database.ref("members").once("value"),
      getMemberContacts(faculty ? facultySlugs[faculty] : activeRole?.facultyKey)
    ]);
    const members = rowsFromSnapshot(membersSnapshot).filter(member => !faculty || member.facultad === faculty)
      .map(member => ({ ...member, ...(contacts[member.id] || {}) }));
    cache.members = members;
    return members;
  }

  async function listProposals(faculty = null) {
    const snapshot = await database.ref("proposals").once("value");
    const proposals = rowsFromSnapshot(snapshot).filter(proposal => !faculty || proposal.facultad === faculty || proposal.faculty === faculty);
    cache.proposals = proposals;
    return proposals;
  }

  async function loadInitialData(faculty = null) {
    await authReady;
    const [members, proposals] = await Promise.all([listMembers(faculty), listProposals(faculty)]);
    return { members, proposals, role: activeRole };
  }

  async function listRoleAssignments() {
    const role = await getUserRole();
    if (role?.role !== "admin") throw new Error("Solo el administrador puede gestionar cargos privilegiados.");
    const snapshot = await database.ref("userRoles").once("value");
    cache.roleAssignments = snapshot.val() || {};
    return cache.roleAssignments;
  }

  async function getUserRole(user = auth.currentUser) {
    if (!user) { activeRole = null; return null }
    const snapshot = await database.ref(`userRoles/${user.uid}`).once("value");
    const role = snapshot.val();
    if (!role || role.active === false) { activeRole = null; return null }
    if (role.memberId) {
      const memberSnapshot = await database.ref(`members/${role.memberId}`).once("value");
      const member = memberSnapshot.val();
      if (!member || member.cargoPrivilegiado !== role.roleKey) { activeRole = null; return null }
    }
    activeRole = { ...role, uid: user.uid, email: user.email };
    return activeRole;
  }

  async function signIn(email, password, selectedRoleKey) {
    const credential = await auth.signInWithEmailAndPassword(email, password);
    const role = await getUserRole(credential.user);
    if (!role || role.active === false || (selectedRoleKey && role.roleKey !== selectedRoleKey)) {
      await auth.signOut();
      activeRole = null;
      throw new Error("La cuenta no tiene permiso para el cargo seleccionado.");
    }
    return role;
  }

  async function signOut() {
    activeRole = null;
    await auth.signOut();
  }

  function subscribeMembers(callback, onError = console.error) {
    const memberReference = database.ref("members");
    let members = {};
    let contacts = {};
    let contactsReference = null;
    let contactsHandler = null;
    let memberContactsReady = false;

    const publish = () => {
      cache.members = Object.entries(members).map(([id, member]) => ({
        id,
        ...member,
        ...(contacts[id]?.correo ? { correo: contacts[id].correo } : {}),
        ...(contacts[id]?.authUid ? { authUid: contacts[id].authUid } : {})
      }));
      callback(cache.members);
    };
    const memberHandler = snapshot => { members = snapshot.val() || {}; publish() };
    memberReference.on("value", memberHandler, onError);

    const stopRoleListener = auth.onAuthStateChanged(async user => {
      if (contactsReference && contactsHandler) contactsReference.off("value", contactsHandler);
      contactsReference = null;
      contactsHandler = null;
      contacts = {};
      memberContactsReady = !user;
      if (!user) { publish(); return }
      try {
        const role = await getUserRole(user);
        if (!role) { memberContactsReady = true; publish(); return }
        const path = role.role === "admin" ? "memberContacts" : role.facultyKey ? `memberContacts/${role.facultyKey}` : null;
        if (!path) { memberContactsReady = true; publish(); return }
        contactsReference = database.ref(path);
        contactsHandler = snapshot => {
          const value = snapshot.val() || {};
          contacts = role.role === "admin"
            ? Object.values(value).reduce((all, facultyContacts) => ({ ...all, ...(facultyContacts || {}) }), {})
            : value;
          memberContactsReady = true;
          publish();
        };
        contactsReference.on("value", contactsHandler, error => { memberContactsReady = true; publish(); onError(error) });
      } catch (error) {
        memberContactsReady = true;
        publish();
        onError(error);
      }
    });

    return () => {
      memberReference.off("value", memberHandler);
      if (contactsReference && contactsHandler) contactsReference.off("value", contactsHandler);
      stopRoleListener();
    };
  }

  function subscribeProposals(callback, onError = console.error) {
    const reference = database.ref("proposals");
    const handler = snapshot => { cache.proposals = rowsFromSnapshot(snapshot); callback(cache.proposals) };
    reference.on("value", handler, onError);
    return () => reference.off("value", handler);
  }

  function subscribeMemberContacts(callback, onError = console.error) {
    let reference = null;
    let handler = null;
    const stopRoleListener = auth.onAuthStateChanged(async user => {
      if (reference && handler) reference.off("value", handler);
      reference = null;
      handler = null;
      if (!user) { callback({}); return }
      try {
        const role = await getUserRole(user);
        const path = role?.role === "admin" ? "memberContacts" : role?.facultyKey ? `memberContacts/${role.facultyKey}` : null;
        if (!path) { callback({}); return }
        reference = database.ref(path);
        handler = snapshot => {
          const value = snapshot.val() || {};
          callback(role.role === "admin"
            ? Object.values(value).reduce((all, facultyContacts) => ({ ...all, ...(facultyContacts || {}) }), {})
            : value);
        };
        reference.on("value", handler, onError);
      } catch (error) { onError(error) }
    });
    return () => { if (reference && handler) reference.off("value", handler); stopRoleListener() };
  }

  async function createMember(member, email = member.correo || member.email || "", photoFile = null) {
    const role = await getUserRole();
    const faculty = member.facultad || role?.faculty;
    const facultyKey = facultySlugs[faculty];
    if (!facultyKey) throw new Error("Selecciona una facultad válida.");
    if (role?.role !== "admin" && role?.faculty !== faculty) throw new Error("No puedes registrar miembros en otra facultad.");
    const photoSource = photoFile || member.foto || "";
    const record = { ...member, facultad: faculty, foto: await uploadImageValue(photoSource, "miembros"), createdAt: firebase.database.ServerValue.TIMESTAMP };
    delete record.correo;
    delete record.email;
    delete record.id;
    delete record.authUid;
    const reference = database.ref("members").push();
    const updates = { [`members/${reference.key}`]: record };
    if (email) updates[`memberContacts/${facultyKey}/${reference.key}`] = { correo: email, facultad: faculty };
    await database.ref().update(updates);
    return { id: reference.key, ...record, ...(email ? { correo: email } : {}) };
  }

  async function updateMember(id, updates) {
    const role = await getUserRole();
    const currentSnapshot = await database.ref(`members/${id}`).once("value");
    const current = currentSnapshot.val();
    if (!current) throw new Error("El miembro ya no existe.");
    if (role?.role !== "admin" && role?.faculty !== current.facultad) throw new Error("No puedes editar miembros de otra facultad.");
    const record = { ...updates };
    const email = record.correo || record.email;
    delete record.correo;
    delete record.email;
    if ("foto" in record) record.foto = await uploadImageValue(record.foto, "miembros");
    await database.ref(`members/${id}`).update(record);
    if (email) await database.ref(`memberContacts/${facultySlugs[current.facultad]}/${id}`).update({ correo: email, facultad: current.facultad });
  }

  async function removeMember(id, confirmationPassword = null) {
    const role = await getUserRole();
    const memberSnapshot = await database.ref(`members/${id}`).once("value");
    const member = memberSnapshot.val();
    if (!member) return;
    const contactSnapshot = await database.ref(`memberContacts/${facultySlugs[member.facultad]}/${id}`).once("value");
    const contact = contactSnapshot.val() || {};
    if (role?.role !== "admin" && role?.faculty !== member.facultad) throw new Error("No puedes eliminar miembros de otra facultad.");
    if (role?.role === "vicepresidente" && member.cargoPrivilegiado) throw new Error("El vicepresidente no puede eliminar cargos privilegiados.");
    if (role?.role === "presidente" && member.cargoPrivilegiado) {
      const viceRoleKey = `vicepresidente-${facultySlugs[role.faculty]}`;
      if (member.cargoPrivilegiado !== viceRoleKey) throw new Error("El presidente no puede eliminarse ni eliminar otros cargos privilegiados.");
      await reauthenticateCurrentUser(confirmationPassword || "");
    }
    const updates = { [`members/${id}`]: null, [`memberContacts/${facultySlugs[member.facultad]}/${id}`]: null };
    if (contact.authUid) updates[`userRoles/${contact.authUid}`] = null;
    await database.ref().update(updates);
  }

  async function saveProposal(proposal, id = null) {
    const role = await getUserRole();
    const record = { ...proposal };
    if (!record.facultad || !facultySlugs[record.facultad]) throw new Error("Selecciona una facultad válida.");
    if (role?.role !== "admin" && role?.faculty !== record.facultad) throw new Error("No puedes publicar propuestas en otra facultad.");
    record.content = await uploadImagesInContent(record.content || "");
    delete record.id;
    record.updatedAt = firebase.database.ServerValue.TIMESTAMP;
    const reference = id ? database.ref(`proposals/${id}`) : database.ref("proposals").push();
    if (!id) record.createdAt = firebase.database.ServerValue.TIMESTAMP;
    await reference.update(record);
    return reference.key;
  }

  async function removeProposal(id) {
    const proposalSnapshot = await database.ref(`proposals/${id}`).once("value");
    const proposal = proposalSnapshot.val();
    const role = await getUserRole();
    if (!proposal) return;
    if (role?.role !== "admin" && role?.faculty !== proposal.facultad) throw new Error("No puedes eliminar propuestas de otra facultad.");
    await database.ref(`proposals/${id}`).remove();
  }

  async function assignPrivilegedRole(roleKey, member, password) {
    const info = roleInfo[roleKey];
    if (!info || info.role === "admin") throw new Error("Cargo privilegiado no válido.");
    if (member.cargo && member.cargo !== "Miembro") throw new Error("Solo se puede asignar un cargo privilegiado a un miembro sin otro cargo.");
    if (member.cargoPrivilegiado) throw new Error("Este miembro ya tiene un cargo privilegiado.");
    if (member.facultad !== info.faculty) throw new Error("El miembro debe pertenecer a la facultad del cargo.");
    const adminRole = await getUserRole();
    if (adminRole?.role !== "admin") throw new Error("Solo el administrador puede asignar cargos privilegiados.");
    const email = member.correo || member.email;
    if (!email) throw new Error("El miembro necesita un correo para iniciar sesión.");
    const assignments = await listRoleAssignments();
    if (Object.values(assignments).some(role => role.roleKey === roleKey)) throw new Error("Ese cargo ya está asignado.");
    const secondaryName = `account-provisioner-${Date.now()}`;
    const secondaryApp = firebase.initializeApp(firebaseConfig, secondaryName);
    let account = null;
    let createdAccount = false;
    let uid = member.authUid || "";
    try {
      if (!uid) {
        const credential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
        account = credential.user;
        uid = account.uid;
        createdAccount = true;
      }
      await database.ref(`userRoles/${uid}`).set({
        role: info.role,
        roleKey,
        faculty: info.faculty,
        facultyKey: info.facultyKey,
        memberId: member.id,
        email,
        active: true,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
      const updates = {};
      updates[`members/${member.id}/cargoPrivilegiado`] = roleKey;
      updates[`memberContacts/${info.facultyKey}/${member.id}`] = { correo: email, facultad: info.faculty, authUid: uid };
      await database.ref().update(updates);
      return uid;
    } catch (error) {
      if (createdAccount && account) await account.delete().catch(() => {});
      throw error;
    } finally {
      await secondaryApp.auth().signOut().catch(() => {});
      await secondaryApp.delete().catch(() => {});
    }
  }

  async function revokeRole(roleKey) {
    const adminRole = await getUserRole();
    if (adminRole?.role !== "admin") throw new Error("Solo el administrador puede eliminar cargos privilegiados.");
    const assignments = await listRoleAssignments();
    const entry = Object.entries(assignments).find(([, role]) => role.roleKey === roleKey);
    if (!entry) throw new Error("No se encontró una cuenta asignada a ese cargo.");
    const [uid, role] = entry;
    const updates = {};
    updates[`userRoles/${uid}`] = null;
    if (role.memberId) {
      updates[`members/${role.memberId}/cargoPrivilegiado`] = null;
    }
    await database.ref().update(updates);
  }

  async function resetPrivilegedPassword(roleKey) {
    const adminRole = await getUserRole();
    if (adminRole?.role !== "admin") throw new Error("Solo el administrador puede restablecer contraseñas.");
    const assignments = await listRoleAssignments();
    const assigned = Object.values(assignments).find(role => role.roleKey === roleKey);
    if (!assigned?.email) throw new Error("No hay correo asignado a ese cargo.");
    await auth.sendPasswordResetEmail(assigned.email);
    return assigned.email;
  }

  async function reauthenticateCurrentUser(password) {
    const user = auth.currentUser;
    if (!user?.email) throw new Error("No hay una sesión autenticada.");
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
    await user.reauthenticateWithCredential(credential);
    await user.getIdToken(true);
  }

  window.UNITECFirebase = {
    auth,
    database,
    firebase,
    firebaseConfig,
    cache,
    authReady,
    facultySlugs,
    roleInfo,
    uploadProfilePhoto,
    uploadProposalImage,
    getUserRole,
    signIn,
    signOut,
    listMembers,
    listProposals,
    listRoleAssignments,
    loadInitialData,
    subscribeMembers,
    subscribeProposals,
    subscribeMemberContacts,
    createMember,
    updateMember,
    removeMember,
    saveProposal,
    removeProposal,
    assignPrivilegedRole,
    revokeRole,
    resetPrivilegedPassword,
    reauthenticateCurrentUser
  };
})();
