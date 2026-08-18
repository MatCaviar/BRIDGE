// Car v1 IIMAudioService (gen5_gvm factory imaudio v1), method order = car's AIDL declaration order.
// AIDL transaction codes follow declaration order: registerCallback=1, unregisterCallback=2, executeCommand=3.
// (Bug fixed 2026-08-13: executeCommand-only declaration sent code 1 -> hit car's registerCallback,
//  leaving the command String unread -> "Parcel data not fully consumed, unread size: ~104".)
package com.immotors.aidl;
import com.immotors.aidl.IIMAudioCallback;
interface IIMAudioService {
    void registerCallback(IIMAudioCallback callback);
    void unregisterCallback(IIMAudioCallback callback);
    void executeCommand(String command, IIMAudioCallback callback);
}
