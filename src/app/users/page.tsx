"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '../../lib/firebase/firebase'; // パスは元のままでOK
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { AppLayout } from '../../components/Layout'; // パスは元のままでOK
import Papa from 'papaparse';
import toast from 'react-hot-toast'; // toartを追加

// 【変更点①】 Userタイプにサービス情報を追加
type User = {
  id: string;
  lastName: string;
  firstName: string;
  jukyushaNo?: string;
  decisionEndDate?: string;
  serviceHoDay?: boolean;
  serviceJihatsu?: boolean;
  serviceSoudan?: boolean;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fetchUsers = async () => {
    const usersCollectionRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersCollectionRef);
    const usersData = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as User[];

    // 表示順のソート
    usersData.sort((a, b) => {
      const aNo = a.jukyushaNo;
      const bNo = b.jukyushaNo;
      if (!aNo && !bNo) return 0;
      if (!aNo) return -1;
      if (!bNo) return 1;
      return aNo.localeCompare(bNo);
    });
    
    setUsers(usersData);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setCsvFile(e.target.files[0]);
    }
  };

  // 【変更点②】 CSVアップロード処理を修正
  const handleUpload = () => {
    if (!csvFile) {
      toast.error('CSVファイルを選択してください。');
      return;
    }
    setIsUploading(true);
    toast.promise(
      new Promise((resolve, reject) => {
        Papa.parse(csvFile, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            try {
              const batch = writeBatch(db);
              results.data.forEach((row: any) => {
                const userRef = doc(collection(db, 'users'));
                
                // CSVの各行を、データベースに保存する形式に変換
                const newUser = {
                  ...row,
                  serviceHoDay: row.serviceHoDay === '1',
                  serviceJihatsu: row.serviceJihatsu === '1',
                  serviceSoudan: row.serviceSoudan === '1',
                };

                batch.set(userRef, newUser);
              });
              await batch.commit();
              resolve('一括登録が完了しました。');
            } catch (error) {
              console.error(error);
              reject(new Error('一括登録中にエラーが発生しました。'));
            }
          },
          error: (error) => {
            console.error(error);
            reject(new Error('CSVファイルの解析に失敗しました。'));
          }
        });
      }),
      {
        loading: 'CSVファイルをアップロード中...',
        success: (message) => {
          fetchUsers(); // 成功したらリストを再読み込み
          setIsModalOpen(false);
          setIsUploading(false);
          setCsvFile(null);
          return message;
        },
        error: (err) => {
          setIsUploading(false);
          return err.message;
        },
      }
    );
  };

  const downloadTemplate = () => {
    // CSVテンプレートのヘッダー
    const headers = "lastName,firstName,lastKana,firstKana,birthday,gender,schoolName,schoolGrade,guardianLastName,guardianFirstName,postalCode,address,contact,contactPerson,allergies,serviceHoDay,serviceJihatsu,serviceSoudan,jukyushaNo,issueDate,cityNo,cityName,daysSpecified,daysDeducted,decisionStartDate,decisionEndDate,upperLimitAmount,upperLimitStartDate,upperLimitEndDate,contractStartDate,contractEndDate,providerNoteNo,contractedAmount,individualSupportSurcharge,selfRelianceSurcharge,capManagementType,capOfficeNo,capOfficeName";
    const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "import_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">利用者一覧</h1>
          <div>
            <button onClick={() => setIsModalOpen(true)} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg mr-2">
              一括登録
            </button>
            <Link href="/users/new" className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">
              新規登録
            </Link>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">氏名</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">受給者証番号</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">給付決定終了日</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map(user => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {`${user.lastName} ${user.firstName}`}
                    {/* 【変更点③】 サービス利用状況をアイコンで表示 */}
                    <div className="flex items-center space-x-2 mt-1">
                      {user.serviceHoDay && <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-sky-600 bg-sky-200">放デイ</span>}
                      {user.serviceJihatsu && <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-emerald-600 bg-emerald-200">児発</span>}
                      {user.serviceSoudan && <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-amber-600 bg-amber-200">相談</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.jukyushaNo || '未設定'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.decisionEndDate || '未設定'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/users/${user.id}`} className="text-indigo-600 hover:text-indigo-900">
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* --- モーダル部分 (省略) --- */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg">
              <h3 className="text-xl font-bold mb-6">利用者の一括登録 (CSV)</h3>
              <div className="mb-4">
                <button onClick={downloadTemplate} className="text-sm text-blue-500 hover:text-blue-600 hover:underline">
                  テンプレートファイル(CSV)をダウンロード
                </button>
              </div>
              <div className="mb-6">
                <label htmlFor="csv-upload" className="block text-sm font-medium text-gray-700 mb-2">CSVファイルを選択</label>
                <input id="csv-upload" type="file" accept=".csv" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
              </div>
              <p className="text-xs text-gray-500 mb-6">
                ※ 1行目には必ずヘッダー（lastName, firstNameなど）を含めてください。<br/>
                ※ 文字コードはUTF-8で保存してください。
              </p>
              <div className="flex justify-end space-x-4">
                <button onClick={() => setIsModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">
                  キャンセル
                </button>
                <button onClick={handleUpload} disabled={isUploading || !csvFile} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-blue-300 disabled:cursor-not-allowed">
                  {isUploading ? '登録中...' : '登録する'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}