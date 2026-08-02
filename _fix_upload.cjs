const fs = require('fs');

const newBlock = `          {/* Upload */}
          {!isReadOnly && (
            <div className="mt-4">
              <StagedUploader
                requestId={request.id}
                auditId={auditId}
                onUploaded={(newDocs) =>
                  setDocuments((prev) => [
                    ...prev,
                    ...newDocs.map((d) => ({
                      id: d.id,
                      filename: d.filename,
                      url: d.url,
                    })),
                  ])
                }
              />
            </div>
          )}
        </section>
        {/* Notes Pad */}`;

// --- Admin file ---
const adminPath = 'c:/Users/320290763/OneDrive - Philips/Desktop/AuditsManagement/audits-tool/src/app/adminDashboard/audits/[auditId]/requests/[requestId]/ui.tsx';
let admin = fs.readFileSync(adminPath, 'utf8');
const adminStart = admin.indexOf('{/* Upload (API route below) */}');
const adminEnd = admin.indexOf('{/* Notes Pad */}');
if (adminStart === -1 || adminEnd === -1) {
  console.log('ADMIN: markers not found', adminStart, adminEnd);
  process.exit(1);
}
admin = admin.slice(0, adminStart) + newBlock + admin.slice(adminEnd + '{/* Notes Pad */}'.length);
fs.writeFileSync(adminPath, admin, 'utf8');
console.log('Admin file updated');

// --- User file ---
const userPath = 'c:/Users/320290763/OneDrive - Philips/Desktop/AuditsManagement/audits-tool/src/app/userDashboard/audits/[auditId]/requests/[requestId]/ui.tsx';
let user = fs.readFileSync(userPath, 'utf8');
// The user file has no "Upload (API route below)" comment, use the isReadOnly form marker
const userStart = user.indexOf('{!isReadOnly && (\n          <form\n            className="mt-4"\n            action={`/api/requests/');
const userEnd = user.indexOf('{/* Notes Pad */}');
if (userStart === -1 || userEnd === -1) {
  console.log('USER: markers not found', userStart, userEnd);
  process.exit(1);
}
user = user.slice(0, userStart) + newBlock + user.slice(userEnd + '{/* Notes Pad */}'.length);
fs.writeFileSync(userPath, user, 'utf8');
console.log('User file updated');
